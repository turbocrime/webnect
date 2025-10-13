# @webnect/driver

WebUSB driver for Xbox 360 Kinect.

## Camera

Camera output is available as `CamImageData` objects that extend `ImageData` and
update automatically.

```typescript
import { Camera, claimNuiCamera, MODE_DEPTH, MODE_VISIBLE } from "@webnect/driver";

const camera = new Camera(await claimNuiCamera());

// configure mode and get image data
const { depth, video } = await camera.setMode({ depth: MODE_DEPTH, video: MODE_VISIBLE });

```

For custom frame processing, construct `CamImageData` with a `rawToRgba`
function:

```typescript
import { Camera, claimNuiCamera, CamImageData, MODE_DEPTH, type RawToRgba } from "@webnect/driver";

const camera = new Camera(await claimNuiCamera());

// define your deraw function (this one is a no-op that always returns a blank buffer)
const customDeraw: RawToRgba = (in, out = new ArrayBuffer(640 * 480 * 4)) => out;
// construct your image sink
const depthImage = new CamImageData(MODE_DEPTH, customDeraw, new Uint8ClampedArray(640 * 480 * 4), 640);

const { depth } = await camera.setMode({ depth: depthImage });
console.log("should be true", depth === depthImage);
```

## Motor

The tilt servo elevation range is ±30 degrees.

The motor won't move if you request a new position very close to the present
position.

```typescript
import { Motor, claimNuiMotor, MotorLed } from "@webnect/driver";

const motor = new Motor(await claimNuiMotor());

// Control LED
await motor.setLed(MotorLed.BLINK_GREEN);

// Control tilt
await motor.setPosition(15); // degrees

// Get current state
const state = await kMotor.getPosition();
console.log(state.angle, state.accelG);
```
