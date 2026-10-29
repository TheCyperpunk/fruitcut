// Dev-only stand-in for the camera: a drawn "room" with a skin-coloured blob
// where the injected test hand is. Used with `?fakecam=1` so automated checks
// never open the real camera.
export interface FakeCamera {
  stream: MediaStream;
  setHand(nx: number | null, ny: number): void;
}

export function createFakeCamera(): FakeCamera {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;
  let hand: { x: number; y: number } | null = null;

  const draw = () => {
    const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    g.addColorStop(0, '#355c7d');
    g.addColorStop(1, '#6c5b7b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (hand) {
      ctx.fillStyle = '#d9a37a';
      ctx.beginPath();
      ctx.ellipse(hand.x * canvas.width, hand.y * canvas.height, 90, 130, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  draw();
  setInterval(draw, 33);

  return {
    stream: canvas.captureStream(30),
    setHand: (nx, ny) => (hand = nx === null ? null : { x: nx, y: ny }),
  };
}
