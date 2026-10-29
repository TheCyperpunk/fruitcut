import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

export interface SegmentResult {
  data: Float32Array; // person confidence per pixel, row-major
  width: number;
  height: number;
}

// Person/background segmentation. The input is a small canvas so the mask
// readback stays cheap; the hand landmarker still gets the full-size video.
export class PersonSegmenter {
  private buffer = new Float32Array(0);

  private constructor(
    private readonly segmenter: ImageSegmenter,
    readonly delegate: 'GPU' | 'CPU',
  ) {}

  static async create(): Promise<PersonSegmenter> {
    const base = import.meta.env.BASE_URL;
    const fileset = await FilesetResolver.forVisionTasks(`${base}wasm`);
    const build = (delegate: 'GPU' | 'CPU') =>
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}models/selfie_segmenter_landscape.tflite`, delegate },
        runningMode: 'VIDEO',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    try {
      return new PersonSegmenter(await build('GPU'), 'GPU');
    } catch (err) {
      console.warn('GPU segmentation unavailable, falling back to CPU', err);
      return new PersonSegmenter(await build('CPU'), 'CPU');
    }
  }

  segment(source: HTMLCanvasElement, timestampMs: number): SegmentResult | null {
    const result = this.segmenter.segmentForVideo(source, timestampMs);
    const masks = result.confidenceMasks ?? [];
    // A two-class model gives [background, person]; a one-channel model gives [person].
    const person = masks.length > 1 ? masks[1] : masks[0];
    if (!person) {
      result.close();
      return null;
    }
    const src = person.getAsFloat32Array();
    if (this.buffer.length !== src.length) this.buffer = new Float32Array(src.length);
    this.buffer.set(src); // copy out before close() releases the mask memory
    const out = { data: this.buffer, width: person.width, height: person.height };
    result.close();
    return out;
  }
}
