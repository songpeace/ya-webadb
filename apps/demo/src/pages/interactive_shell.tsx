import { DefaultButton } from "@fluentui/react";
import { AdbSubprocessProtocol } from "@yume-chan/adb";
import {
    Consumable,
    ConsumableWritableStream,
    WritableStream,
    WritableStreamDefaultWriter,
} from "@yume-chan/stream-extra";
import { observer } from "mobx-react-lite";
import { NextPage } from "next";
import React, { useEffect, useRef } from "react";
import { GLOBAL_STATE } from "../state";

const InteractiveShell: NextPage = () => {
    const shellContainerRef = useRef<HTMLDivElement>(null);
    
    // 使用全局状态
    const shell = GLOBAL_STATE.shell;
    const output = GLOBAL_STATE.shellOutput;
    const isConnected = GLOBAL_STATE.shellConnected;
    const writerRef = useRef<WritableStreamDefaultWriter<Consumable<Uint8Array>> | null>(null);

    // 简单的字符处理
    const processOutput = (newText: string, currentOutput: string): string => {
        let result = currentOutput;
        
        for (let i = 0; i < newText.length; i++) {
            const char = newText[i];
            const code = newText.charCodeAt(i);
            
            if (code === 8) { // 退格 \b
                result = result.slice(0, -1);
            } else if (code === 13) { // 回车 \r
                // 只有在后面紧跟换行符时才处理，否则忽略单独的\r
                if (i + 1 < newText.length && newText.charCodeAt(i + 1) === 10) {
                    result += '\n';
                    i++; // 跳过下一个\n
                }
                // 单独的\r不做处理，保持现有内容
            } else if (code === 7) { // 响铃 - 忽略
                continue;
            } else if (char === '\x1b') { // ESC序列
                let j = i + 1;
                while (j < newText.length) {
                    const escChar = newText[j];
                    if ((escChar >= 'A' && escChar <= 'Z') || 
                        (escChar >= 'a' && escChar <= 'z') ||
                        escChar === '~') {
                        break;
                    }
                    j++;
                }
                
                const sequence = newText.substring(i, j + 1);
                // 只处理明确的清屏命令
                if (sequence === '\x1b[2J' || sequence === '\x1b[H\x1b[2J') {
                    result = ''; // 清屏
                }
                i = j;
            } else {
                result += char;
            }
        }
        
        return result;
    };

    // 自动滚动和设置光标 - 分离这些操作
    const scrollToBottom = () => {
        if (shellContainerRef.current) {
            shellContainerRef.current.scrollTop = shellContainerRef.current.scrollHeight;
        }
    };

    // 设置光标到末尾并滚动到底部
    const updateCursorAndScroll = () => {
        if (shellContainerRef.current && isConnected) {
            const container = shellContainerRef.current;
            
            requestAnimationFrame(() => {
                container.focus();
                
                // 设置光标到最末尾
                const range = document.createRange();
                const selection = window.getSelection();
                
                if (container.firstChild) {
                    range.setStartAfter(container.lastChild || container.firstChild);
                    range.collapse(true);
                } else {
                    range.selectNodeContents(container);
                    range.collapse(false);
                }
                
                selection?.removeAllRanges();
                selection?.addRange(range);
                
                // 滚动到底部
                scrollToBottom();
            });
        }
    };

    useEffect(() => {
        // 当output更新时，更新光标位置和滚动
        if (isConnected) {
            updateCursorAndScroll();
        }
    }, [output, isConnected]);

    useEffect(() => {
        initializeShell();
        // 移除cleanup，让shell在页面切换时保持活跃
    }, []);

    const initializeShell = async () => {
        if (!GLOBAL_STATE.adb) return;

        // 如果已经有连接的shell，直接返回
        if (GLOBAL_STATE.shell && GLOBAL_STATE.shellConnected) {
            writerRef.current = GLOBAL_STATE.shellWriter || null;
            return;
        }

        try {
            GLOBAL_STATE.setShellOutput("Initializing shell...\n");
            
            const shellInstance = await GLOBAL_STATE.adb.subprocess.shell();
            GLOBAL_STATE.shell = shellInstance;
            
            const writer = shellInstance.stdin.getWriter();
            writerRef.current = writer;
            GLOBAL_STATE.shellWriter = writer;

            // 使用全局状态中的输出作为基础，而不是重置为空字符串
            let currentOutput = GLOBAL_STATE.shellOutput;

            shellInstance.stdout.pipeTo(
                new WritableStream({
                    write: (chunk) => {
                        const text = new TextDecoder().decode(chunk);
                        currentOutput = processOutput(text, currentOutput);
                        GLOBAL_STATE.setShellOutput(currentOutput);
                    },
                    close() {
                        console.log("stdout stream closed");
                    },
                    abort(reason) {
                        console.log("stdout stream aborted:", reason);
                    }
                })
            ).catch(error => {
                console.log("stdout pipe error:", error);
            });

            shellInstance.stderr?.pipeTo(
                new WritableStream({
                    write: (chunk) => {
                        const text = new TextDecoder().decode(chunk);
                        currentOutput += text;
                        GLOBAL_STATE.setShellOutput(currentOutput);
                    },
                    close() {
                        console.log("stderr stream closed");
                    },
                    abort(reason) {
                        console.log("stderr stream aborted:", reason);
                    }
                })
            ).catch(error => {
                console.log("stderr pipe error:", error);
            });

            shellInstance.exit.then((exitCode) => {
                GLOBAL_STATE.setShellOutput(GLOBAL_STATE.shellOutput + `\n[Process exited with code: ${exitCode}]\n`);
                GLOBAL_STATE.setShellConnected(false);
            }).catch(error => {
                console.log("Shell exit error:", error);
                GLOBAL_STATE.setShellOutput(GLOBAL_STATE.shellOutput + `\n[Shell disconnected]\n`);
                GLOBAL_STATE.setShellConnected(false);
            });

            GLOBAL_STATE.setShellConnected(true);
            
        } catch (error) {
            console.error("Failed to initialize shell:", error);
            GLOBAL_STATE.setShellOutput(`[ERROR]: Failed to initialize shell: ${error}\n`);
        }
    };

    const sendCommand = async (command: string) => {
        if (!writerRef.current || !isConnected) return;

        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(command);
            await ConsumableWritableStream.write(writerRef.current, data);
        } catch (error) {
            console.error("Failed to send command:", error);
            GLOBAL_STATE.setShellOutput(GLOBAL_STATE.shellOutput + `[ERROR]: Failed to send command: ${error}\n`);
        }
    };

    const handleKeyDown = async (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!isConnected) {
            event.preventDefault();
            return;
        }

        event.preventDefault();

        const key = event.key;

        if (event.ctrlKey) {
            switch (key.toLowerCase()) {
                case 'c':
                    await sendCommand('\x03');
                    return;
                case 'd':
                    await sendCommand('\x04');
                    return;
                case 'z':
                    await sendCommand('\x1a');
                    return;
                case 'l':
                    await sendCommand('\x0c');
                    return;
                case 'u':
                    await sendCommand('\x15');
                    return;
            }
        }

        switch (key) {
            case 'Enter':
                await sendCommand('\r');
                break;
            case 'Backspace':
                await sendCommand('\x7f');
                break;
            case 'Delete':
                await sendCommand('\x1b[3~');
                break;
            case 'Tab':
                await sendCommand('\t');
                break;
            case 'ArrowUp':
                await sendCommand('\x1b[A');
                break;
            case 'ArrowDown':
                await sendCommand('\x1b[B');
                break;
            case 'ArrowLeft':
                await sendCommand('\x1b[D');
                break;
            case 'ArrowRight':
                await sendCommand('\x1b[C');
                break;
            case 'Home':
                await sendCommand('\x1b[H');
                break;
            case 'End':
                await sendCommand('\x1b[F');
                break;
            default:
                if (key.length === 1 && !event.altKey && !event.metaKey) {
                    await sendCommand(key);
                }
                break;
        }
    };

    const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (!isConnected) return;

        const pastedText = event.clipboardData.getData('text');
        await sendCommand(pastedText);
    };

    // 完全阻止contentEditable的默认编辑行为
    const handleBeforeInput = (event: React.FormEvent<HTMLDivElement>) => {
        event.preventDefault();
        return false;
    };

    const handleInput = (event: React.FormEvent<HTMLDivElement>) => {
        event.preventDefault();
        // 如果内容被意外修改，恢复正确的内容
        if (shellContainerRef.current && shellContainerRef.current.textContent !== output) {
            updateCursorAndScroll();
        }
        return false;
    };

    const cleanup = async () => {
        await GLOBAL_STATE.cleanupShell();
        writerRef.current = null;
    };

    const clearOutput = () => {
        GLOBAL_STATE.clearShellOutput();
    };

    const handleClick = () => {
        if (isConnected && shellContainerRef.current) {
            updateCursorAndScroll();
        }
    };

    return (
        <div style={{ 
            height: "100vh", 
            padding: 20, 
            display: "flex", 
            flexDirection: "column",
            gap: 10
        }}>
            <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
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

            <div 
                ref={shellContainerRef}
                contentEditable={isConnected}
                suppressContentEditableWarning={true}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onInput={handleInput}
                onBeforeInput={handleBeforeInput}
                onClick={handleClick}
                style={{ 
                    border: "1px solid #ccc", 
                    borderRadius: 4,
                    backgroundColor: "#1e1e1e",
                    color: "#fff",
                    padding: 10,
                    fontFamily: "monospace, Consolas, 'Courier New'",
                    fontSize: 14,
                    lineHeight: 1.2,
                    flex: 1,
                    overflowY: "auto",
                    whiteSpace: "pre-wrap",
                    outline: 'none',
                    cursor: isConnected ? 'text' : 'default',
                    minHeight: "100px"
                }}
                tabIndex={0}
            >
                {/* 显示输出内容，未连接时显示等待消息 */}
                {output || (!isConnected ? "Waiting for shell connection..." : "")}
            </div>

            <div style={{ fontSize: 12, color: "#666", flexShrink: 0 }}>
                Status: {isConnected ? "Connected - Click above to focus and type" : "Disconnected"}
            </div>
        </div>
    );
};

export default observer(InteractiveShell);
