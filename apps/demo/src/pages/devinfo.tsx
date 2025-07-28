// cspell: ignore bootloader
// cspell: ignore fastboot

import {
    DefaultButton,
    MessageBar,
    MessageBarType,
    Spinner,
    SpinnerSize,
    Stack,
    TextField,
    TooltipHost,
    Text,
    Separator
} from "@fluentui/react";
import { observer } from "mobx-react-lite";
import { NextPage } from "next";
import Head from "next/head";
import { useEffect, useState } from "react";
import { GLOBAL_STATE } from "../state";
import { RouteStackProps } from "../utils";

// Import commands from the JSON file
import commandsData from "../data/commands.json";

interface Command {
    name: string;
    command: string;
    description?: string;
}

interface CommandCategory {
    category: string;
    commands: Command[];
}

const Devinfo: NextPage = () => {
    const [output, setOutput] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [commandCategories, setCommandCategories] = useState<CommandCategory[]>([]);
    const [activeCommand, setActiveCommand] = useState<string | null>(null);

    useEffect(() => {
        // Set commands from imported data
        setCommandCategories(commandsData);
    }, []);

    const handleCommand = async (command: string) => {
        if (!GLOBAL_STATE.adb) return;
        
        try {
            setIsLoading(true);
            setError(null);
            setActiveCommand(command);
            
            const result = await GLOBAL_STATE.adb.power.shell(command);
            setOutput(result);
        } catch (err) {
            console.error(`Error executing command: ${command}`, err);
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Stack {...RouteStackProps}>
            <Head>
                <title>Device Info - Tango</title>
            </Head>

            <div style={{ marginBottom: 20 }}>
                <MessageBar messageBarType={MessageBarType.info}>
                    Select a command to execute on the device
                </MessageBar>
            </div>

            {/* Display output area fixed at the top */}
            <div style={{ marginBottom: 20 }}>
                {isLoading ? (
                    <Stack horizontalAlign="center" verticalAlign="center" style={{ padding: 20 }}>
                        <Spinner size={SpinnerSize.large} label={`Running: ${activeCommand}`} />
                    </Stack>
                ) : error ? (
                    <MessageBar messageBarType={MessageBarType.error}>
                        Error: {error}
                    </MessageBar>
                ) : output ? (
                    <TextField
                        label="Result"
                        multiline
                        rows={10}
                        readOnly
                        value={output}
                        styles={{
                            field: {
                                fontFamily: "monospace",
                                fontSize: 14,
                                backgroundColor: "#f5f5f5",
                                overflowX: "auto",
                                whiteSpace: "pre",
                            },
                            wrapper: {
                                width: "100%",
                            }
                        }}
                    />
                ) : (
                    <Text>Select a command to see the result</Text>
                )}
            </div>

            {/* Command buttons area with scrolling */}
            <div style={{ 
                maxHeight: "calc(100vh - 350px)",
                overflowY: "auto",
                padding: "0 10px"
            }}>
                {commandCategories.map((category, categoryIndex) => (
                    <div key={categoryIndex} style={{ marginBottom: 20 }}>
                        <Separator alignContent="start">
                            <Text variant="large" style={{ fontWeight: 600 }}>{category.category}</Text>
                        </Separator>

                        <div style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "10px",
                            marginTop: 10
                        }}>
                            {category.commands.map((cmd, index) => (
                                <TooltipHost
                                    key={index}
                                    content={cmd.description || ""}
                                    id={`cmd-tooltip-${categoryIndex}-${index}`}
                                >
                                    <DefaultButton
                                        text={cmd.name}
                                        disabled={!GLOBAL_STATE.adb || isLoading}
                                        onClick={() => handleCommand(cmd.command)}
                                        aria-describedby={`cmd-tooltip-${categoryIndex}-${index}`}
                                    />
                                </TooltipHost>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </Stack>
    );
};

export default observer(Devinfo);