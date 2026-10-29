import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { CONFIG } from './config';

export interface Tracker {
  delegate: 'GPU' | 'CPU';
  detect(source: HTMLVideoElement, timestampMs: number): HandLandmarkerResult;
}

export async function createTracker(): Promise<Tracker> {
  const base = import.meta.env.BASE_URL;
  const fileset = await FilesetResolver.forVisionTasks(`${base}wasm`);

  const create = (delegate: 'GPU' | 'CPU') =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${base}models/hand_landmarker.task`, delegate },
      runningMode: 'VIDEO',
      numHands: CONFIG.tracking.numHands,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

  let delegate: Tracker['delegate'] = 'GPU';
  let landmarker: HandLandmarker;
  try {
    landmarker = await create('GPU');
  } catch (err) {
    console.warn('GPU hand tracking unavailable, falling back to CPU', err);
    delegate = 'CPU';
    landmarker = await create('CPU');
  }

  return {
    delegate,
    detect: (source, timestampMs) => landmarker.detectForVideo(source, timestampMs),
  };
}
