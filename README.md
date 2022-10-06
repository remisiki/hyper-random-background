# hyper-random-background

Set background with random images every time interval.

## Usage

Add to `~/.hyper.js`:

```javascript
module.exports = {
  ...
  config: {
    ...
    backgroundColor: 'rgba(0, 0, 0, 0.9)', // It is recommended to add transparency to default backgroundColor
    ...
    backgroundImage: {
      folder: "/home/remisiki/Pictures/terminal-background-image", // Full path to where images are stored
      overlayColor: "rgba(0, 0, 0, 0.7)", // Overlay color in front of the image, default: rgba(0, 0, 0, 0.7)
      interval: 10, // Time interval in second to change background, default: 600
      fade: true, // Whether use fade effect when switching background, default: true
      blur: "5px", // Size of blur effect, default: "0px"
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