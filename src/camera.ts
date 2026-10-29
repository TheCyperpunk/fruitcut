export type CameraErrorKind = 'denied' | 'missing' | 'insecure' | 'other';

export class CameraError extends Error {
  constructor(
    message: string,
    readonly kind: CameraErrorKind,
  ) {
    super(message);
  }
}

export async function startCamera(video: HTMLVideoElement, stream?: MediaStream): Promise<void> {
  if (stream) {
    await attach(video, stream);
    return;
  }
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraError(
      'The camera only works on a secure page. Open the game on localhost or over https.',
      'insecure',
    );
  }

  let cameraStream: MediaStream;
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 60 },
      },
    });
  } catch (err) {
    const name = (err as DOMException).name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new CameraError(
        'fruitcut needs your camera to see your hand. Allow camera access for this site in your browser settings, then try again.',
        'denied',
      );
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new CameraError('No camera found. Connect a webcam and try again.', 'missing');
    }
    throw new CameraError(`Couldn't start the camera (${name}).`, 'other');
  }
  await attach(video, cameraStream);
}

async function attach(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (!video.videoWidth) {
    await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }));
  }
}
