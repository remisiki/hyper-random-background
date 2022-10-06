# hyper-random-background

Set background with random images every time interval.

## Install

```shell
npm i hyper-random-background
```

## Usage

Add to `~/.hyper.js`:

```javascript
module.exports = {
  ...
  config: {
    ...
    // It is recommended to add transparency to default backgroundColor
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    ...
    backgroundImage: {
      // Full path to where images are stored
      folder: "/home/remisiki/Pictures/terminal-background-image",
      // Overlay color in front of the image, default: rgba(0, 0, 0, 0.7)
      overlayColor: "rgba(0, 0, 0, 0.7)",
      // Time interval in second to change background, default: 600
      interval: 10,
      // Whether use fade effect when switching background, default: true
      fade: true,
      // Size of blur effect, default: "0px"
      blur: "5px",
    },
  },
  ...
  plugins: [
    ...
    "hyper-random-background",
  ],
  ...
}
```