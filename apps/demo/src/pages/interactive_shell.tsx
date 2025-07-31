import { DefaultButton, IconButton } from "@fluentui/react";
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

interface ShellTabProps {
    shellId: string;
    isActive: boolean;
    onActivate: () => void;
    onClose: () => void;
}

const ShellTab: React.FC<ShellTabProps & { tabIndex: number }> = ({ shellId, isActive, onActivate, onClose, tabIndex }) => {
    const shellData = GLOBAL_STATE.shells.get(shellId);
    
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 12px",
                backgroundColor: isActive ? "#0078d4" : "#f3f2f1",
                color: isActive ? "white" : "black",
                border: "1px solid #ccc",
                borderBottom: isActive ? "none" : "1px solid #ccc",
                cursor: "pointer",
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
                marginRight: 2,
                minWidth: 80,
            }}
            onClick={onActivate}
        >
            <span style={{ marginRight: 8 }}>Shell {tabIndex}</span>
            <div
                style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: shellData?.connected ? "#00ff00" : "#ff0000",
                    marginRight: 8,
                }}
            />
            <div
                onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                }}
                style={{
                    width: 16,
                    height: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: "bold",
                    color: isActive ? "white" : "#323130",
                    borderRadius: 2,
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = isActive ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                }}
            >
                ×
            </div>
        </div>
    );
};

const ShellTerminal: React.FC<{ shellId: string }> = observer(({ shellId }) => {
    const shellContainerRef = useRef<HTMLDivElement>(null);
    const writerRef = useRef<WritableStreamDefaultWriter<Consumable<Uint8Array>> | null>(null);
    
    const shellData = GLOBAL_STATE.shells.get(shellId);
    const output = shellData?.output || "";
    const isConnected = shellData?.connected || false;

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

    // 自动滚动和设置光标
    const scrollToBottom = () => {
        if (shellContainerRef.current) {
            shellContainerRef.current.scrollTop = shellContainerRef.current.scrollHeight;
        }
    };

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
        if (isConnected) {
            updateCursorAndScroll();
        }
    }, [output, isConnected]);

    useEffect(() => {
        initializeShell();
    }, [shellId]);

    const initializeShell = async () => {
        if (!GLOBAL_STATE.adb) return;

        // 如果已经有连接的shell，直接返回
        if (shellData && shellData.connected && shellData.shell) {
            writerRef.current = shellData.writer;
            return;
        }

        try {
            GLOBAL_STATE.setShellOutput(shellId, "Initializing shell...\n");
            
            const shellInstance = await GLOBAL_STATE.adb.subprocess.shell();
            const writer = shellInstance.stdin.getWriter();
            writerRef.current = writer;

            // 创建或更新shell数据
            GLOBAL_STATE.shells.set(shellId, {
                shell: shellInstance,
                output: "Initializing shell...\n",
                connected: true,
                writer: writer,
            });

            let currentOutput = "Initializing shell...\n";

            shellInstance.stdout.pipeTo(
                new WritableStream({
                    write: (chunk) => {
                        const text = new TextDecoder().decode(chunk);
                        currentOutput = processOutput(text, currentOutput);
                        GLOBAL_STATE.setShellOutput(shellId, currentOutput);
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
                        GLOBAL_STATE.setShellOutput(shellId, currentOutput);
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
                const shellData = GLOBAL_STATE.shells.get(shellId);
                if (shellData) {
                    GLOBAL_STATE.setShellOutput(shellId, shellData.output + `\n[Process exited with code: ${exitCode}]\n`);
                    GLOBAL_STATE.setShellConnected(shellId, false);
                }
            }).catch(error => {
                console.log("Shell exit error:", error);
                const shellData = GLOBAL_STATE.shells.get(shellId);
                if (shellData) {
                    GLOBAL_STATE.setShellOutput(shellId, shellData.output + `\n[Shell disconnected]\n`);
                    GLOBAL_STATE.setShellConnected(shellId, false);
                }
            });
            
        } catch (error) {
            console.error("Failed to initialize shell:", error);
            GLOBAL_STATE.setShellOutput(shellId, `[ERROR]: Failed to initialize shell: ${error}\n`);
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
            const shellData = GLOBAL_STATE.shells.get(shellId);
            if (shellData) {
                GLOBAL_STATE.setShellOutput(shellId, shellData.output + `[ERROR]: Failed to send command: ${error}\n`);
            }
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

    const handleBeforeInput = (event: React.FormEvent<HTMLDivElement>) => {
        event.preventDefault();
        return false;
    };

    const handleInput = (event: React.FormEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (shellContainerRef.current && shellContainerRef.current.textContent !== output) {
            updateCursorAndScroll();
        }
        return false;
    };

    const handleClick = () => {
        if (isConnected && shellContainerRef.current) {
            updateCursorAndScroll();
        }
    };

    const clearOutput = () => {
        GLOBAL_STATE.clearShellOutput(shellId);
    };

    return (
        <div style={{ 
            display: "flex", 
            flexDirection: "column",
            height: "100%",
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
                {output || (!isConnected ? "Waiting for shell connection..." : "")}
            </div>

            <div style={{ fontSize: 12, color: "#666", flexShrink: 0 }}>
                Status: {isConnected ? "Connected - Click above to focus and type" : "Disconnected"}
            </div>
        </div>
    );
});

const InteractiveShell: NextPage = observer(() => {
    const [shellTabs, setShellTabs] = useState<string[]>([]);

    useEffect(() => {
        // 从全局状态恢复标签页
        const existingTabs = GLOBAL_STATE.getShellTabs();
        if (existingTabs.length > 0) {
            setShellTabs(existingTabs);
            // 如果没有活跃的标签页，设置第一个为活跃
            if (!GLOBAL_STATE.activeShellId) {
                GLOBAL_STATE.setActiveShellId(existingTabs[0]);
            }
        } else {
            // 初始化时创建第一个标签页
            const firstShellId = GLOBAL_STATE.createShellTab();
            setShellTabs([firstShellId]);
            GLOBAL_STATE.setActiveShellId(firstShellId);
        }
    }, []);

    const addNewTab = () => {
        const newShellId = GLOBAL_STATE.createShellTab();
        setShellTabs([...shellTabs, newShellId]);
        GLOBAL_STATE.setActiveShellId(newShellId);
    };

    const closeTab = (shellId: string) => {
        if (shellTabs.length <= 1) return; // 至少保留一个标签页
        
        GLOBAL_STATE.closeShellTab(shellId);
        const newTabs = shellTabs.filter(id => id !== shellId);
        setShellTabs(newTabs);
        
        // 如果关闭的是当前活跃标签页，切换到第一个标签页
        if (GLOBAL_STATE.activeShellId === shellId && newTabs.length > 0) {
            GLOBAL_STATE.setActiveShellId(newTabs[0]);
        }
    };

    const activateTab = (shellId: string) => {
        GLOBAL_STATE.setActiveShellId(shellId);
    };

    return (
        <div style={{ 
            height: "100vh", 
            padding: 20, 
            display: "flex", 
            flexDirection: "column",
            overflow: "hidden"
        }}>
            {/* 标签页栏 */}
            <div style={{ 
                display: "flex", 
                alignItems: "flex-end",
                marginBottom: 0,
                borderBottom: "1px solid #ccc",
                flexShrink: 0
            }}>
                {shellTabs.map((shellId, index) => (
                    <ShellTab
                        key={shellId}
                        shellId={shellId}
                        tabIndex={index + 1}
                        isActive={GLOBAL_STATE.activeShellId === shellId}
                        onActivate={() => activateTab(shellId)}
                        onClose={() => closeTab(shellId)}
                    />
                ))}
                <div
                    onClick={addNewTab}
                    style={{
                        marginLeft: 8,
                        marginBottom: 8,
                        backgroundColor: "transparent",
                        border: "1px solid transparent",
                        borderRadius: 4,
                        width: 32,
                        height: 32,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        fontSize: 18,
                        fontWeight: "bold",
                        color: "#323130",
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#f3f2f1";
                        e.currentTarget.style.border = "1px solid #ccc";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.border = "1px solid transparent";
                    }}
                >
                    +
                </div>
            </div>

            {/* 当前活跃的终端 */}
            <div style={{ 
                flex: 1, 
                paddingTop: 10,
                minHeight: 0,
                overflow: "hidden"
            }}>
                {GLOBAL_STATE.activeShellId && (
                    <ShellTerminal shellId={GLOBAL_STATE.activeShellId} />
                )}
            </div>
        </div>
    );
});

export default InteractiveShell;
