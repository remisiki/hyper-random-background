const DEFAULT_COLOR = "rgba(0, 0, 0, .7)";
const DEFAULT_INTERVAL = 600;
const DEFAULT_FADE = true;
const DEFAULT_BLUR = "0px";
const DEFAULT_OPACITY_DELAY = "0.4s";
const DEFAULT_SWITCH_BACKGROUND_KEY = "CmdOrCtrl+Shift+S";

const fs = require("fs");
const path = require("path");
const { Menu, ipcRenderer, ipcMain } = require("electron");

// I have no other way to pass config to decorateMenu, so define a global config here
// These variables may have inconsistent values in frontend and backend
// globalConfigProxy will only work in frontend
let globalConfig = undefined;
let globalConfigProxy = undefined;
let defaultProfile = undefined;
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

		getRandomImagePath() {
			const filePath = defaultProfile.path;
			if (!filePath) {
				return null;
			} else {
				const files = fs.readdirSync(filePath)
				const images = files.filter(x => x.match(/(\.jpg)|(\.png)|(\.jpe)|(\.jpeg)$/i))
				const image = images[Math.floor(Math.random() * images.length)];
				return path.resolve(filePath, image);
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
				const overlayColor = (defaultProfile.overlayColor || DEFAULT_COLOR);
				const opacityDelay = (defaultProfile.fade === false) ? "0s" : DEFAULT_OPACITY_DELAY;
				const blur = (defaultProfile.blur || DEFAULT_BLUR);
				background.style.setProperty("--background-opacity", 0);
				background.style.setProperty("--background-color", overlayColor);
				background.style.setProperty("--opacity-delay", opacityDelay);
				background.style.setProperty("--blur-size", blur);
				setTimeout(() => {
					background.style.setProperty("--background-image", `url("file://${image}")`);
				}, this.setImageDelay);
				setTimeout(() => {
					background.style.setProperty("--background-opacity", 1);
				}, this.fadeInDelay);
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
				--blur-size: ${blur}
			}
			.terms_terms::before {
				content: "";
				background-image: var(--background-image);
				background-position: center;
				background-size: cover;
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
	// Listen from frontend
	if (ipcMain.rawListeners("change-background").length > 0) {
		ipcMain.removeAllListeners("change-background");
	}
	ipcMain.on("change-background", () => updateBackgroundOfAllWindows());
	return globalConfig;
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
	const profileList = [];
	const profileNames = Object.keys(globalConfig.backgroundImage.profiles);
	profileNames.forEach((name, i) => {
		profileList.push({
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
		});
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
				}
			]
		}
	];
	return newMenu;
}
