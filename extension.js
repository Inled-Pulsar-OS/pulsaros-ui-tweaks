import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as BackgroundMenu from 'resource:///org/gnome/shell/ui/backgroundMenu.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';
import * as WorkspaceSwitcherPopup from 'resource:///org/gnome/shell/ui/workspaceSwitcherPopup.js';
import * as SwitcherPopup from 'resource:///org/gnome/shell/ui/switcherPopup.js';
import * as Search from 'resource:///org/gnome/shell/ui/search.js';
import * as SearchController from 'resource:///org/gnome/shell/ui/searchController.js';
import * as WorkspaceThumbnail from 'resource:///org/gnome/shell/ui/workspaceThumbnail.js';
import * as WorkspacesView from 'resource:///org/gnome/shell/ui/workspacesView.js';
import * as Panel from 'resource:///org/gnome/shell/ui/panel.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as WindowPreview from 'resource:///org/gnome/shell/ui/windowPreview.js';
import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';
import * as LookingGlass from 'resource:///org/gnome/shell/ui/lookingGlass.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as OSDWindow from 'resource:///org/gnome/shell/ui/osdWindow.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {API} from './lib/API.js';
import {Manager} from './lib/Manager.js';
import * as modsList from './mods/modsList.js';
import {NotificationPositionManager} from './notif/notificationPosition.js';

export default class PulsarUITweaksExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        // 1. Initialize Just Perfection Core Manager
        const shellVersion = parseFloat(Config.PACKAGE_VERSION);
        const interfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});

        this._jpAPI = new API(
            {
                Main,
                BackgroundMenu,
                OverviewControls,
                WorkspaceSwitcherPopup,
                SwitcherPopup,
                InterfaceSettings: interfaceSettings,
                Search,
                SearchController,
                WorkspaceThumbnail,
                WorkspacesView,
                Panel,
                PanelMenu,
                WindowPreview,
                Workspace,
                LookingGlass,
                MessageTray,
                OSDWindow,
            },
            shellVersion
        );

        this._jpManager = new Manager({
            API: this._jpAPI,
            Settings: this._settings,
        });
        this._jpManager.start();

        // 2. Initialize Notification Position Manager
        this._notifManager = new NotificationPositionManager(this.dir, this._settings);
        this._notifManager.start();

        // 3. Initialize GNOME UI Improvements Mods
        this._availableMods = modsList.get();
        this._activeMods = {};

        Object.keys(this._availableMods).forEach(name => {
            this._settings.connectObject(`changed::${name}`, () => {
                this._refreshMod(name);
            }, this);
            this._refreshMod(name);
        });
    }

    _refreshMod(name) {
        if (!this._availableMods || !this._availableMods[name]) return;

        let enabled = false;
        let modArg = false;
        const val = this._settings.get_value(name);
        if (val.get_type_string() === 's') {
            if (this._activeMods[name]) {
                this._activeMods[name].disable();
                delete this._activeMods[name];
            }
            modArg = this._settings.get_enum(name);
            enabled = true;
        } else {
            enabled = this._settings.get_boolean(name);
        }

        if (enabled) {
            if (this._activeMods[name]) return;
            try {
                const mod = new this._availableMods[name](modArg);
                mod.enable();
                this._activeMods[name] = mod;
            } catch (e) {
                console.error(`[Pulsar UI Tweaks] Error enabling mod ${name}:`, e);
            }
        } else if (this._activeMods[name]) {
            try {
                this._activeMods[name].disable();
            } catch (e) {
                console.error(`[Pulsar UI Tweaks] Error disabling mod ${name}:`, e);
            }
            delete this._activeMods[name];
        }
    }

    disable() {
        // Teardown UI Mods
        if (this._settings) {
            this._settings.disconnectObject(this);
        }
        if (this._activeMods) {
            for (const key in this._activeMods) {
                try {
                    this._activeMods[key].disable();
                } catch (e) {}
            }
            this._activeMods = null;
        }
        this._availableMods = null;

        // Teardown Notification Position Manager
        if (this._notifManager) {
            this._notifManager.stop();
            this._notifManager = null;
        }

        // Teardown Just Perfection Manager
        if (this._jpManager) {
            this._jpManager.stop();
            this._jpManager = null;
        }
        this._jpAPI = null;

        this._settings = null;
    }
}
