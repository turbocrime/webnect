# webnect

**(try [live demo](https://turbocrime.github.io/webnect/))**

this is a webusb driver for microsoft's xbox360 kinect.

<https://github.com/turbocrime/webnect/assets/134443988/40879425-cd91-4bae-a14f-633dc0f8d88c>

chrome only :'C mozzy dont do webusb

i have never written a usb driver before, nor even a typescript library, so critique is welcome.

this driver at least works with "Xbox NUI Motor" PID `0x02b0` and "Xbox NUI Camera" PID `0x02ae` devices, labelled "Model 1414", because that's what i found at goodwill. i there may be a few externally-identical models of "kinect", some with dramatic hardware revisions. if your device doesn't work with this, please verify that it works at all, and then send me the details.

## what

the kinect is an early consumer depth sensor based on structured light projection, plus some other goodies. it was released in 2010 as a gamer thing and nobody cares about it anymore except me

they're fun, and they go for like $5 now. plus they're usb2, so i can drive them with throwaway SBCs like an rpi3. maybe not with this driver, but that's how i got familiar. i been using them for video synth input, and interactive generative art installations

a webusb driver lets more folks see it in person :) after i rewrite everything :)

## ware

original kinect only.

### Xbox NUI Motor

* accelerometer
* tilt servo
* blinkenlights

### Xbox NUI Camera

* depth 11bpp, 10bpp
* visible 8bpp bayer, 16bpp yuv
* infrared 10bpp
* arbitrary register manipulation

visible and infrared stream from the same endpoint, so you can only have one at a time. you can use my pipeline and get a `ReadableStream<ImageData>` that you just blit to canvas, or set a custom deraw function.

## why

building libfreenect with emscripten turned out to be impossible for various reasons.  whatever. it's the future and webusb is real

## how

go dig your kinect out of the closet. plug it in. open <https://turbocrime.github.io/webnect>

for a local demo, clone this repo.

## diy

available on npm as [`@webnect/webnect`](https://www.npmjs.com/package/@webnect/webnect)

no docs yet, but it's pretty simple. you can grab a new kinect camera with

```typescript
import k from "@webnect/webnect";
const dev: USBDevice = await k.claimNuiCamera();
const kcam = k.Camera(dev);
kcam.mode({ depth: k.DEPTH_MODE });
const depthStream: ReadableStream<ImageData> = kcam.depth.getReader();
```

alternatively, if you want raw frames in a specific mode, you could

```typescript
import k, { Modes, CamType, CamFmtVisible } from "@webnect/webnect";
const dev: USBDevice = await k.claimNuiCamera();
const kcam = k.Camera(dev, {
        modes: { depth: Modes.OFF, video: { stream: CamType.VISIBLE, format: CamFmtVisible.YUV_16B } },
        deraw: { depth: false, video: false }
});
const yuvFrameStream: ReadableStream<ArrayBuffer> = kcam.video.getReader();
```

### um its broekn??

if you see an empty device selection modal, you probably have the wrong model kinect. you can check your usb devices with `lsusb` on linux or on `system_profiler SPUSBDataType` on macos

if you see glitchy stream output, haha nice. cool

### bad parts

a single kinect is technically three devices in a trenchcoat. afaict there's no way to associate them, because webusb won't expose bus position. it doesn't matter; you probably only plugged in one kinect anyway.

also, typescript aint exactly the optimal language for bitmath or destructuring binary data

## way

probably going after pose features next, maybe alignment of video to depth. and then firmware/audio stuff.

someday.... kinect2?
