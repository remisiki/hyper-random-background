const DEFAULT_COLOR = "rgba(0, 0, 0, .7)";
const DEFAULT_INTERVAL = 600;
const DEFAULT_FADE = true;
const DEFAULT_BLUR = "0px";
const DEFAULT_OPACITY_DELAY = "0.4s";
const DEFAULT_SWITCH_BACKGROUND_KEY = "CmdOrCtrl+Shift+S";

const fs = require("fs");
const path = require("path");
const sizeOf = require("image-size");
const { Menu, ipcRenderer, ipcMain, shell } = require("electron");

// I have no other way to pass config to decorateMenu, so define a global config here
// These variables may have inconsistent values in frontend and backend
// globalConfigProxy will only work in frontend
let globalConfig = undefined;
let globalConfigProxy = undefined;
let defaultProfile = undefined;
let currentImages = [];
// windows only live in backend
const windows = [];

// This function works at frontend
module.exports.decorateHyper = (Hyper, { React, notify }) => {
	return class extends React.PureComponent {
		constructor(props) {
			super(props);
			this.repaint = undefined;
			this.lastImage = undefined;
			this.init(defaultProfile);
		}

		init(defaultProfile) {
			// Interval is expected to be a good number
			this.interval = defaultProfile.interval;
			if (!Number.isInteger(this.interval)) {
				console.error(`Interval ${this.interval} is not an integer, fall back to default.`);
				this.interval = DEFAULT_INTERVAL;
			} else if (this.interval < 1) {
				console.error(`Interval ${this.interval} is too short, fall back to default.`);
				this.interval = DEFAULT_INTERVAL;
			}
			this.interval *= 1000;

			this.effectEnabled = (defaultProfile.fade === false) ? false : true;
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
			// Listen from backend
			// If globalConfigFromBackend specified, globalConfig at frontend will be updated
			if (ipcRenderer.rawListeners("change-background").length > 0) {
				ipcRenderer.removeAllListeners("change-background");
			}
			ipcRenderer.on("change-background", (e, globalConfigFromBackend) => {
				if (globalConfigFromBackend) {
					globalConfig = globalConfigFromBackend;
					defaultProfile = globalConfig.backgroundImage.profiles[globalConfig.backgroundImage.default];
					this.init(defaultProfile); // Update other parameters
				}
				// Change background and reset interval
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

		imageIsVertical(filePath) {
			const dimensions = sizeOf(filePath);
			return (dimensions.height / dimensions.width > 1.1);
		}

		getImageChildrenOfDir(filePath) {
			const files = fs.readdirSync(filePath);
			const images = files
				.filter(x => x.match(/(\.jpg)|(\.png)|(\.jpe)|(\.jpeg)|(\.webp)$/i))
				.map(x => path.resolve(filePath, x))
			;
			return images;
		}

		getRandomImagePath() {
			const filePath = defaultProfile.path;
			const fileStat = fs.lstatSync(filePath);
			let images = [];
			try {
				if (fileStat.isFile()) {
					// Path is a file, read every line in the file
					const entries = fs.readFileSync(filePath).toString().split("\n").filter(x => x);
					entries.forEach(entry => {
						const entryStat = fs.lstatSync(entry);
						if (entryStat.isFile()) {
							images.push(entry);
						} else if (entryStat.isDirectory()) {
							images = images.concat(this.getImageChildrenOfDir(entry));
						}
					});
				} else if (fileStat.isDirectory()) {
					// Path is directory, list all images in that directory
					images = images.concat(this.getImageChildrenOfDir(filePath));
				}
			} catch (err) {
				console.error(err);
				return [];
			}
			if (images.length > 0) {
				const image = images[Math.floor(Math.random() * images.length)];
				if (this.imageIsVertical(image)) {
					// If image is vertical, randomly select another one different from this one
					// If nextImage is also vertical, align them in a line
					// If nextImage is horizontal, only use nextImage
					images.splice(images.indexOf(image), 1);
					const nextImage = images[Math.floor(Math.random() * images.length)];
					if (!nextImage) {
						return [image];
					} else if (!this.imageIsVertical(nextImage)) {
						return [nextImage];
					}
					return [image, nextImage];
				} else {
					return [image];
				}
			} else {
				return [];
			}
		}

		changeBackground() {
			if (!defaultProfile.path) {
				// If path is nothing
				ipcRenderer.send("set-image-path", []);
				const background = document.querySelector(".terms_terms");
				background.style.setProperty("--background-opacity", 0);
				background.style.setProperty("--background-color", "unset");
				background.style.setProperty("--opacity-delay", "unset");
				background.style.setProperty("--blur-size", "unset");
				background.style.setProperty("--background-image", "unset");
			} else {
				const images = this.getRandomImagePath();
				ipcRenderer.send("set-image-path", images);
				if ((images.length === 0) || (JSON.stringify(images) === JSON.stringify(this.lastImage))) {
					// If the same image is selected, do nothing
					return;
				} else {
					this.lastImage = [...images];
					const background = document.querySelector(".terms_terms");
					const imageUrls = (images.length === 1) ? `url("file://${images[0]}")` : `url("file://${images[0]}"), url("file://${images[1]}")`;
					const backgroundPosition = (images.length === 1) ? "center" : "left, right";
					const backgroundSize = (images.length === 1) ? "cover" : "50%";
					const overlayColor = (defaultProfile.overlayColor || DEFAULT_COLOR);
					const opacityDelay = (defaultProfile.fade === false) ? "0s" : DEFAULT_OPACITY_DELAY;
					const blur = (defaultProfile.blur || DEFAULT_BLUR);
					background.style.setProperty("--background-opacity", 0);
					background.style.setProperty("--background-color", overlayColor);
					background.style.setProperty("--opacity-delay", opacityDelay);
					background.style.setProperty("--blur-size", blur);
					setTimeout(() => {
						background.style.setProperty("--background-position", backgroundPosition);
						background.style.setProperty("--background-size", backgroundSize);
						background.style.setProperty("--background-image", imageUrls);
					}, this.setImageDelay);
					setTimeout(() => {
						background.style.setProperty("--background-opacity", 1);
					}, this.fadeInDelay);
				}
			}
		}

	};
}

// This function works at frontend
module.exports.reduceUI = (state, {type, config}) => {
	switch (type) {
		case "CONFIG_LOAD":
			globalConfig = config;
			// Set up proxy to listen for changes on globalConfig
			// Change background if globalConfig changes
			globalConfigProxy = new Proxy(globalConfig, {
				set(target, prop, value) {
					target[prop] = value;
					updateBackgroundOfAllWindows(false); // Set false to execute from frontend
				}
			});
			return state.set("customConfig", config);
		case "CONFIG_RELOAD": 
			// Set by proxy to apply changes
			globalConfigProxy.backgroundImage = config.backgroundImage;
			defaultProfile = config.backgroundImage.profiles[config.backgroundImage.default];
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

// This function works at backend
module.exports.decorateConfig = (config) => {
	defaultProfile = config.backgroundImage.profiles[config.backgroundImage.default];
	const overlayColor = (defaultProfile.overlayColor || DEFAULT_COLOR);
	const opacityDelay = (defaultProfile.fade === false) ? "0s" : DEFAULT_OPACITY_DELAY;
	const blur = (defaultProfile.blur || DEFAULT_BLUR);
	globalConfig = Object.assign({}, config, {
		css: `
			${config.css || ''}
			.terms_terms {
				--background-image: unset;
				--background-opacity: 1;
				--background-color: ${overlayColor};
				--opacity-delay: ${opacityDelay};
				--blur-size: ${blur};
				--background-position: center;
				--background-size: cover;
			}
			.terms_terms::before {
				content: "";
				background-image: var(--background-image);
				background-position: var(--background-position);
				background-size: var(--background-size);
				background-repeat: no-repeat;
				transition: opacity var(--opacity-delay) ease;
				opacity: var(--background-opacity);
				position: absolute;
				top: 0;
				left: 0;
				bottom: 0;
				right: 0;
			}
			.terms_termGroup {
				background-color: var(--background-color);
				backdrop-filter: blur(var(--blur-size));
			}
		`
	});
	return globalConfig;
}

// This function works at backend
module.exports.onApp = (app) => {
	// Listen from frontend
	ipcMain
		.on("change-background", () => updateBackgroundOfAllWindows())
		.on("set-image-path", (e, images) => {currentImages = [...images]})
	;
}

// This function works at backend
module.exports.onWindow = (win) => {
	windows.push(win);
}

// This function works at both frontend and backend
const updateBackgroundOfAllWindows = (backend = true) => {
	if (backend) {
		windows.forEach((win) => {
			win.webContents.send("change-background", globalConfig);
		});
	} else {
		ipcRenderer.send("change-background");
	}
}

// This function works at backend
module.exports.decorateMenu = (menu) => {
	const profileNames = Object.keys(globalConfig.backgroundImage.profiles);
	const profileList = profileNames.map((name, i) => {
		return {
			id: `background-profile-${name}`,
			label: name,
			type: "checkbox",
			checked: (name === globalConfig.backgroundImage.default),
			click: () => {
				const _menu = Menu.getApplicationMenu();
				// Uncheck other profiles
				profileNames.forEach((_name) => {
					const profileMenuItem = _menu.getMenuItemById(`background-profile-${_name}`);
					profileMenuItem.checked = (_name === name);
				});
				// Update config. There is no proxy at backend, so change background manually
				globalConfig.backgroundImage.default = name;
				defaultProfile = globalConfig.backgroundImage.profiles[name];
				updateBackgroundOfAllWindows();
			},
		};
	});
	const newMenu = [
		...menu,
		{
			label: "Background",
			submenu: [
				{
					label: "Profiles",
					submenu: profileList
				},
				{
					label: "Next Image",
					click: () => updateBackgroundOfAllWindows(),
					accelerator: defaultProfile.switchBackgroundKey || DEFAULT_SWITCH_BACKGROUND_KEY
				},
				{
					label: "View Current Image",
					click: () => {
						currentImages.forEach((i) => shell.openPath(i));
					}
				}
			]
		}
	];
	return newMenu;
}
