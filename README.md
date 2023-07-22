# webnect *...now with [live demo](https://turbocrime.github.io/webnect/)!*

this is a webusb driver for microsoft's xbox360 kinect.

![webnect](https://github.com/turbocrime/webnect/assets/134443988/1bfbb58f-4a5a-4276-8cde-b80c7d91b63a)

chrome only :'C mozzy dont do webusb

i have never written a usb driver before, nor even a typescript library, so critique is welcome.

currently, this driver only supports "Xbox NUI Motor" PID `0x02b0` and "Xbox NUI Camera" PID `0x02ae` devices, because that's what i found at goodwill. theres a few different models of "kinect", some with dramatic hardware revisions. if your device doesn't work with this, please verify that it works at all, and then send me the details.

## what

the kinect is an early consumer depth sensor based on structured light projection, plus some other goodies. it was released in 2010 as a gamer thing and nobody cares about it anymore except me

they're fun, and they go for like $5 now. plus they're usb2, so i can drive them with throwaway SBCs like an rpi3. maybe not with this driver, but that's how i got familiar. i been using them for video synth input, and interactive generative art installations (yes i do parties, hmu) but it's the kind of thing you really gotta see in person

a webusb driver lets more folks see it in person :) after i rewrite everything :)

## ware

### Xbox NUI Motor

* accelerometer
* tilt servo
* blinkenlights

### Xbox NUI Camera

* depth camera 11bit only
* thats it
* no ir
* no visible

## why

i failed to build libfreenect with emscripten. libusb added webusb/wasm platform support last year, so theoretically it's possible.

i had it at some point but then i couldn't build the examples, and then something changed and my script stopped working. idk. emscripten is always dropping symbols or targeting "darwin" or trying to use pthreads or something. also cmake is hell.

whatever. its the future and webusb is real

## how

i guess i should figure out how to upload to npm, but for now you can just pull this repo.

go dig your kinect out of the closet. plug it in. run

```sh
$ pnpm install
$ pnpm dev
```

that kicks off a little https guy with a fresh self-signed cert.

open <https://localhost:5174/>

after you dismiss the scary ssl warning you'll see a page with basic demos. go wild.

by default, it will try to acquire just the camera. hit the button (webusb requires user action to initiate), then select one of the available devices in the modal (there is probably only one).

## dont work

if you see nothing in the device selection modal, you probably have the wrong model of kinect. check your device ID on linux by running `lsusb` and on macos by running `system_profiler SPUSBDataType`

if you see glitchy stream output, haha nice. cool

## bad parts

typescript aint exactly the optimal language for bitmath or destructuring binary data

a single kinect is technically three devices in a trenchcoat. afaict there's no way to associate them, because webusb won't expose bus position. it doesn't matter; you probably only plugged in one kinect anyway.

## the future

the mathy parts are an obvious candidate for webgpu acceleration. do NOT send a patch i wanna do it

i should probably learn how to actually use canvas and arraybuffers

probably going after ir video next, then bayer/yuv, and then audio device and firmware stuff.

someday.... kinect2?
