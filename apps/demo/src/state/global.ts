import { Adb, AdbDaemonDevice, AdbPacketData, AdbSubprocessProtocol } from "@yume-chan/adb";
import { WritableStreamDefaultWriter } from "@yume-chan/stream-extra";
import { Consumable } from "@yume-chan/stream-extra";
import { action, makeAutoObservable, observable } from "mobx";

export type PacketLogItemDirection = "in" | "out";

export interface PacketLogItem extends AdbPacketData {
    direction: PacketLogItemDirection;

    timestamp?: Date;
    commandString?: string;
    arg0String?: string;
    arg1String?: string;
    payloadString?: string;
}

export class GlobalState {
    device: AdbDaemonDevice | undefined = undefined;
    adb: Adb | undefined = undefined;

    errorDialogVisible = false;
    errorDialogMessage = "";

    logs: PacketLogItem[] = [];

    // Interactive Shell state - 支持多个shell标签页
    shells: Map<string, {
        shell: AdbSubprocessProtocol;
        output: string;
        connected: boolean;
        writer: WritableStreamDefaultWriter<Consumable<Uint8Array>>;
    }> = new Map();
    activeShellId = "";
    shellTabCounter = 0;

    constructor() {
        makeAutoObservable(this, {
            hideErrorDialog: action.bound,
            logs: observable.shallow,
            shells: observable,
            createShellTab: action.bound,
            setActiveShellId: action.bound,
            setShellOutput: action.bound,
            setShellConnected: action.bound,
            clearShellOutput: action.bound,
            closeShellTab: action.bound,
            cleanupAllShells: action.bound,
        });
    }

    setDevice(device: AdbDaemonDevice | undefined, adb: Adb | undefined) {
        this.device = device;
        this.adb = adb;
    }

    showErrorDialog(message: Error | string) {
        this.errorDialogVisible = true;
        if (message instanceof Error) {
            this.errorDialogMessage = message.stack || message.message;
        } else {
            this.errorDialogMessage = message;
        }
    }

    hideErrorDialog() {
        this.errorDialogVisible = false;
    }

    appendLog(direction: PacketLogItemDirection, packet: AdbPacketData) {
        this.logs.push({
            ...packet,
            direction,
            timestamp: new Date(),
            payload: packet.payload.slice(),
        } as PacketLogItem);
    }

    clearLog() {
        this.logs.length = 0;
    }

    createShellTab(): string {
        this.shellTabCounter++;
        const shellId = `shell-${this.shellTabCounter}`;
        // 创建一个占位符，等到需要时再创建实际的shell
        this.shells.set(shellId, {
            shell: null as any, // 临时占位符
            output: "",
            connected: false,
            writer: null as any, // 临时占位符
        });
        return shellId;
    }

    setActiveShellId(shellId: string) {
        this.activeShellId = shellId;
    }

    setShellOutput(shellId: string, output: string) {
        const shellData = this.shells.get(shellId);
        if (shellData) {
            shellData.output = output;
        }
    }

    setShellConnected(shellId: string, connected: boolean) {
        const shellData = this.shells.get(shellId);
        if (shellData) {
            shellData.connected = connected;
        }
    }

    clearShellOutput(shellId: string) {
        const shellData = this.shells.get(shellId);
        if (shellData) {
            shellData.output = "";
        }
    }

    async closeShellTab(shellId: string) {
        const shellData = this.shells.get(shellId);
        if (shellData) {
            try {
                if (shellData.writer) {
                    try {
                        await shellData.writer.close();
                    } catch (error) {
                        console.log("Writer already closed");
                    }
                }
                
                if (shellData.shell) {
                    try {
                        shellData.shell.kill();
                    } catch (error) {
                        console.log("Error killing shell:", error);
                    }
                }
            } catch (error) {
                console.error("Error during shell cleanup:", error);
            }
        }
        
        this.shells.delete(shellId);
        
        // 如果关闭的是当前活跃的标签页，切换到其他标签页
        if (this.activeShellId === shellId) {
            const remainingShells = Array.from(this.shells.keys());
            this.activeShellId = remainingShells.length > 0 ? remainingShells[0] : "";
        }
    }

    async cleanupAllShells() {
        for (const [shellId] of this.shells) {
            await this.closeShellTab(shellId);
        }
    }

    getActiveShell() {
        return this.shells.get(this.activeShellId);
    }

    getShellTabs() {
        return Array.from(this.shells.keys());
    }
}

export const GLOBAL_STATE = new GlobalState();
