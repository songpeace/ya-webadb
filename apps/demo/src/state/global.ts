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

    // Interactive Shell state
    shell: AdbSubprocessProtocol | undefined = undefined;
    shellOutput = "";
    shellConnected = false;
    shellWriter: WritableStreamDefaultWriter<Consumable<Uint8Array>> | undefined = undefined;

    constructor() {
        makeAutoObservable(this, {
            hideErrorDialog: action.bound,
            logs: observable.shallow,
            setShellOutput: action.bound,
            setShellConnected: action.bound,
            clearShellOutput: action.bound,
            cleanupShell: action.bound,
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

    setShellOutput(output: string) {
        this.shellOutput = output;
    }

    setShellConnected(connected: boolean) {
        this.shellConnected = connected;
    }

    clearShellOutput() {
        this.shellOutput = "";
    }

    async cleanupShell() {
        try {
            this.shellConnected = false;

            if (this.shellWriter) {
                try {
                    await this.shellWriter.close();
                } catch (error) {
                    console.log("Writer already closed");
                }
                this.shellWriter = undefined;
            }

            if (this.shell) {
                try {
                    this.shell.kill();
                } catch (error) {
                    console.log("Error killing shell:", error);
                }
                this.shell = undefined;
            }
        } catch (error) {
            console.error("Error during shell cleanup:", error);
        }
    }
}

export const GLOBAL_STATE = new GlobalState();
