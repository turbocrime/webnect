# webnect

**(try [live demo](https://turbocrime.github.io/webnect/))**

this is a webusb driver for microsoft's xbox360 kinect.

<https://github.com/turbocrime/webnect/assets/134443988/40879425-cd91-4bae-a14f-633dc0f8d88c>

webusb is only available in chrome.

this driver at least works with "Xbox NUI Motor" PID `0x02b0` and "Xbox NUI
Camera" PID `0x02ae` devices, labelled "Model 1414", because that's what i found
at goodwill.

if your device doesn't work with this, please verify that it works at all, and
then send me the details.

## what

the kinect is an early consumer depth sensor based on structured light
projection, plus some other goodies. it was released in 2010 as a gamer thing
and nobody cares about it anymore except me

they're fun, and they go for like $5 now. plus they're usb2, so i can drive them
with throwaway SBCs like an rpi3. i've been using them for video synth input,
and interactive art installations

a webusb driver lets more folks see it in person :)

## why

building libfreenect with emscripten turned out to be impossible for various
reasons.  whatever. it's the future and webusb is real

## ware

original xbox 360 kinect only.

- Xbox NUI Motor
  - accelerometer
  - tilt servo
  - LED light

- Xbox NUI Camera
  - depth 11bpp, 10bpp
  - visible bayer, yuv
  - infrared 10bpp
  - register manipulation

visible and infrared stream from the same hardware endpoint, so you can only
have one of those at a time. 

## how

go dig your kinect out of the closet. plug it in. open
<https://turbocrime.github.io/webnect>

or for a local demo, clone this repo and run:

```bash
pnpm install
pnpm dev
```

demo web server opens on vite default `https://localhost:5173`

## diy

available on npm as
[`@webnect/driver`](https://www.npmjs.com/package/@webnect/driver)

### its broken??

#### is webusb available?

if your browser doesn't have webusb, you can't use this.

webusb is only available in secure contexts.

#### no device to select?

if you see an empty device selection modal, you probably have the wrong model
kinect.

if the motor is available but the camera is not, make sure your kinect is 
powered correctly.

check your usb devices: 
  - on linux use `lsusb`
  - on macos use `system_profiler SPUSBDataType`

#### its glitchy

haha nice. cool

### bad parts

a single kinect is technically three USB devices in a trenchcoat. full control
requires multiple permission requests.

the motor device does not report a serial number, so there's no way to reliably
associate the motors if you have multiple kinects.
