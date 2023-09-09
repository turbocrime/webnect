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
* visible 8bpp bayer
* infrared 10bpp

visible and infrared stream from the same endpoint, so you can only have one at a time.

## why

i failed to build libfreenect with emscripten. libusb added webusb/wasm platform support last year, so theoretically it's possible.

whatever. its the future and webusb is real

## how

go dig your kinect out of the closet. plug it in. open <https://turbocrime.github.io/webnect>

## diy

available on npm as [`@webnect/webnect`](https://www.npmjs.com/package/@webnect/webnect)

or for a local demo, clone this repo. run

```sh
$ pnpm install
$ pnpm dev
```

that kicks off a little https guy with a fresh self-signed cert.

open <https://localhost:5174/>

after you dismiss the scary ssl warning you'll see a page with basic demos. go wild.

by default, it will try to acquire just the camera. hit the button (webusb requires user action to initiate), then select one of the available devices in the modal (there is probably only one).

no docs, but the lib is pretty simple. you can instantiate a new kinect with

```typescript
import { KinectDevice } from webnect;
const k = await (new KinectDevice()).ready;
```

the constructor takes a single optional argument, `devices`, of type

```typescript
devices? : {
    camera?: USBDevice | boolean, // default true
    motor?: USBDevice| boolean, // default false
    audio?: USBDevice | boolean, // default false
}
```

pass a boolean indicating your desire to request acquisition, or pass a USBDevice if you have already one already acquired.

### um its broekn

if you see an empty device selection modal, you probably have the wrong model kinect. you can check your usb devices with `lsusb` on linux or on `system_profiler SPUSBDataType` on macos

if you see glitchy stream output, haha nice. cool

### bad parts

a single kinect is technically three devices in a trenchcoat. afaict there's no way to associate them, because webusb won't expose bus position. it doesn't matter; you probably only plugged in one kinect anyway.

also, typescript aint exactly the optimal language for bitmath or destructuring binary data

## way

the mathy parts are an obvious candidate for assemblyscript and webgpu acceleration. do NOT send a patch i wanna do it

i should probably learn how to actually use canvas and streams

probably going after pose features next, maybe registration of visible light to depth frames. and then audio device and firmware stuff.

someday.... kinect2?
