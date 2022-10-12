const DEFAULT_COLOR = "rgba(0, 0, 0, .7)";
const DEFAULT_INTERVAL = 600;
const DEFAULT_FADE = true;
const DEFAULT_BLUR = "0px";

const fs = require("fs");
const path = require("path");
const { ipcRenderer } = require("electron");

module.exports.decorateHyper = (Hyper, { React, notify }) => {
	return class extends React.PureComponent {
		constructor(props) {
			super(props);
			this.repaint = undefined;
			this.lastImage = undefined;

			// Interval is expected to be a good number
			this.interval = this.props.customConfig.backgroundImage?.interval;
			if (!Number.isInteger(this.interval)) {
				console.error(`Interval ${this.interval} is not an integer, fall back to default.`);
				this.interval = DEFAULT_INTERVAL;
			} else if (this.interval < 1) {
				console.error(`Interval ${this.interval} is too short, fall back to default.`);
				this.interval = DEFAULT_INTERVAL;
			}
			this.interval *= 1000;

			this.effectEnabled = (this.props.customConfig.backgroundImage?.fade === false) ? false : true;
			this.setImageDelay = this.effectEnabled ? 300 : 0;
			this.fadeInDelay = this.effectEnabled ? 600 : 0;
		}

		render() {
			return (
				React.createElement(Hyper, Object.assign({}, this.props))
			);
		}

		componentDidMount() {
			if (!this.repaint) {
				// Init
				this.changeBackground();
				// Change every time interval
				this.repaint = setInterval(() => {
					this.changeBackground();
				}, this.interval);
			}
			ipcRenderer.on("change-background", () => {
				this.changeBackground();
				clearInterval(this.repaint);
				this.repaint = setInterval(() => {
					this.changeBackground();
				}, this.interval);
			});
		}

		componentWillUnmount() {
			if (this.repaint) {
				clearInterval(this.repaint);
				this.repaint = undefined;
			}
		}

		getRandomImagePath() {
			const folder = this.props.customConfig.backgroundImage?.folder;
			if (!folder) {
				return null;
			} else {
				const files = fs.readdirSync(folder)
				const images = files.filter(x => x.match(/(\.jpg)|(\.png)|(\.jpe)|(\.jpeg)$/i))
				const image = images[Math.floor(Math.random() * images.length)];
				return path.resolve(folder, image);
			}
		}

		changeBackground() {
			const image = this.getRandomImagePath();
			if ((!image) || (image === this.lastImage)) {
				// If the same image is selected, do nothing
				return;
			} else {
				this.lastImage = image;
				const background = document.querySelector(".terms_terms");
				background.style.setProperty("--background-opacity", 0);
				setTimeout(() => {
					background.style.setProperty("--background-image", `url(file://${image})`);
				}, this.setImageDelay);
				setTimeout(() => {
					background.style.setProperty("--background-opacity", 1);
				}, this.fadeInDelay);
			}
		}

	};
}

module.exports.reduceUI = (state, {type, config}) => {
	switch (type) {
		case "CONFIG_LOAD":
		case "CONFIG_RELOAD": 
			return state.set("customConfig", config);
		default:
			return state;
	}
}

module.exports.mapHyperState = (state, map) => {
	return Object.assign({}, map, {
		customConfig: state.ui.customConfig
	});
}

module.exports.decorateConfig = (config) => {
	const opacityDelay = (config.backgroundImage?.fade === false) ? "0s" : "0.5s";
	const blur = (config.backgroundImage?.blur || DEFAULT_BLUR);
	return Object.assign({}, config, {
		css: `
			${config.css || ''}
			.terms_terms {
				--background-image: unset;
				--background-opacity: 1;
			}
			.terms_terms::before {
				content: "";
				background-image: var(--background-image);
				background-position: center;
				background-size: cover;
				transition: opacity ${opacityDelay} ease;
				opacity: var(--background-opacity);
				position: absolute;
				top: 0;
				left: 0;
				bottom: 0;
				right: 0;
			}
			.terms_termGroup {
				background-color: ${config.backgroundImage?.overlayColor || DEFAULT_COLOR};
				backdrop-filter: blur(${blur});
			}
		`
	});
}

module.exports.decorateMenu = (menu, b) => {
	const newMenu = [
		...menu,
		{
			label: "Background",
			submenu: [
				{
					label: "Next Image",
					click: (item, win) => {win.webContents.send("change-background")},
					accelerator: "CmdOrCtrl+Shift+S"
				}
			]
		}
	];
	return newMenu;
}
