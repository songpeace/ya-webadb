// interactive-shell.tsx
import { DefaultButton, Stack, TextField } from "@fluentui/react";
import { AdbSubprocessProtocol } from "@yume-chan/adb";
import {
    Consumable,
    ConsumableWritableStream,
    WritableStream,
    WritableStreamDefaultWriter,
} from "@yume-chan/stream-extra";
import { observer } from "mobx-react-lite";
import { NextPage } from "next";
import React, { useEffect, useRef, useState } from "react";
import { GLOBAL_STATE } from "../state";
const InteractiveShell: NextPage = () => {
    const [shell, setShell] = useState<AdbSubprocessProtocol | null>(null);
    const [output, setOutput] = useState<string>("");
    const [input, setInput] = useState<string>("");
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const writerRef = useRef<WritableStreamDefaultWriter<Consumable<Uint8Array>> | null>(null);
    const outputRef = useRef<string>("");

    useEffect(() => {
        initializeShell();
        return () => {
            cleanup();
        };
    }, []);

    const initializeShell = async () => {
        if (!GLOBAL_STATE.adb) return;

        try {
            // 创建shell连接
            const shellInstance = await GLOBAL_STATE.adb.subprocess.shell();
            setShell(shellInstance);
            
            // 获取writer用于输入
            const writer = shellInstance.stdin.getWriter();
            writerRef.current = writer;

            // 设置输出流监听
            shellInstance.stdout.pipeTo(
                new WritableStream({
                    write: (chunk) => {
                        const text = new TextDecoder().decode(chunk);
                        outputRef.current += text;
                        setOutput(outputRef.current);
                    },
                    close() {
                        console.log("stdout stream closed");
                    },
                    abort(reason) {
                        console.log("stdout stream aborted:", reason);
                    }
                })
            ).catch(error => {
                console.log("stdout pipe error (expected on disconnect):", error);
            });

            // 监听错误流
            shellInstance.stderr?.pipeTo(
                new WritableStream({
                    write: (chunk) => {
                        const text = new TextDecoder().decode(chunk);
                        outputRef.current += `[ERROR]: ${text}`;
                        setOutput(outputRef.current);
                    },
                    close() {
                        console.log("stderr stream closed");
                    },
                    abort(reason) {
                        console.log("stderr stream aborted:", reason);
                    }
                })
            ).catch(error => {
                console.log("stderr pipe error (expected on disconnect):", error);
            });

            // 监听进程退出
            shellInstance.exit.then((exitCode) => {
                outputRef.current += `\n[Process exited with code: ${exitCode}]\n`;
                setOutput(outputRef.current);
                setIsConnected(false);
            }).catch(error => {
                // 这里捕获 "Socket ended without exit message" 错误
                console.log("Shell exit error (expected on force disconnect):", error);
                outputRef.current += `\n[Shell disconnected]\n`;
                setOutput(outputRef.current);
                setIsConnected(false);
            });

            setIsConnected(true);
            
            // 发送初始化命令，比如设置PS1提示符
            await sendCommand("export PS1='$ '\n");
            
        } catch (error) {
            console.error("Failed to initialize shell:", error);
            outputRef.current += `[ERROR]: Failed to initialize shell: ${error}\n`;
            setOutput(outputRef.current);
        }
    };

    const sendCommand = async (command: string) => {
        if (!writerRef.current || !isConnected) return;

        try {
        const encoder = new TextEncoder();
        const data = encoder.encode(command);
        
        // 使用 ConsumableWritableStream.write 而不是直接调用 writer.write
        await ConsumableWritableStream.write(writerRef.current, data);
        
        // 添加命令到输出显示
        // outputRef.current += `${command}`;
        // setOutput(outputRef.current);
            
        } catch (error) {
            console.error("Failed to send command:", error);
            outputRef.current += `[ERROR]: Failed to send command: ${error}\n`;
            setOutput(outputRef.current);
        }
    };

    const handleInputSubmit = async () => {
        if (!input.trim()) return;

        const command = input.endsWith('\n') ? input : input + '\n';
        await sendCommand(command);
        setInput("");
    };

    const handleKeyPress = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleInputSubmit();
        }
    };

    const cleanup = async () => {
        try {
            // 先设置连接状态为false
            setIsConnected(false);
            
            // 关闭writer
            if (writerRef.current) {
                try {
                    await writerRef.current.close();
                } catch (error) {
                    console.log("Writer already closed");
                }
                writerRef.current = null;
            }
            
            // 发送exit命令来优雅地退出shell，而不是强制kill
            if (shell && isConnected) {
                try {
                    // 尝试优雅退出
                    const encoder = new TextEncoder();
                    const exitCommand = encoder.encode("exit\n");
                    
                    // 如果writer还可用，发送exit命令
                    if (writerRef.current) {
                        await ConsumableWritableStream.write(writerRef.current, exitCommand);
                    }
                    
                    // 等待一小段时间让进程正常退出
                    setTimeout(() => {
                        if (shell) {
                            shell.kill();
                        }
                    }, 1000);
                    
                } catch (error) {
                    // 如果优雅退出失败，直接kill
                    console.log("Graceful exit failed, force killing");
                    shell.kill();
                }
            }
            
            setShell(null);
            
        } catch (error) {
            console.error("Error during cleanup:", error);
            // 即使出错也要重置状态
            setIsConnected(false);
            setShell(null);
            writerRef.current = null;
        }
    };

    const clearOutput = () => {
        outputRef.current = "";
        setOutput("");
    };

    return (
        <Stack tokens={{ childrenGap: 10 }} style={{ height: "100vh", padding: 20 }}>
            <h2>Interactive Shell</h2>
            
            <div style={{ display: "flex", gap: 10 }}>
                <DefaultButton 
                    text="Reconnect" 
                    onClick={initializeShell}
                    disabled={isConnected}
                />
                <DefaultButton 
                    text="Clear Output" 
                    onClick={clearOutput}
                />
                <DefaultButton 
                    text="Disconnect" 
                    onClick={cleanup}
                    disabled={!isConnected}
                />
            </div>

            <div style={{ 
                border: "1px solid #ccc", 
                borderRadius: 4,
                backgroundColor: "#1e1e1e",
                color: "#fff",
                padding: 10,
                fontFamily: "monospace",
                fontSize: 14,
                height: "400px",
                overflowY: "auto",
                whiteSpace: "pre-wrap"
            }}>
                {output || "Waiting for shell output..."}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
                <TextField
                    value={input}
                    onChange={(_, value) => setInput(value || "")}
                    onKeyPress={handleKeyPress}
                    placeholder="Enter command..."
                    disabled={!isConnected}
                    styles={{ root: { flexGrow: 1 } }}
                />
                <DefaultButton 
                    text="Send" 
                    onClick={handleInputSubmit}
                    disabled={!isConnected || !input.trim()}
                />
            </div>

            <div style={{ fontSize: 12, color: "#666" }}>
                Status: {isConnected ? "Connected" : "Disconnected"}
            </div>
        </Stack>
    );
};

export default observer(InteractiveShell);