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
    TooltipHost
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

const Devinfo: NextPage = () => {
    const [output, setOutput] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [commands, setCommands] = useState<Command[]>([]);

    useEffect(() => {
        // If you need to fetch the commands.json dynamically, you can do it here
        // For example if it's in the public folder:
        /*
        fetch('/commands.json')
            .then(response => response.json())
            .then(data => setCommands(data))
            .catch(err => console.error('Error loading commands:', err));
        */
        
        // Otherwise, if it's imported directly, just set it
        setCommands(commandsData);
    }, []);

    const handleCommand = async (command: string) => {
        if (!GLOBAL_STATE.adb) return;
        
        try {
            setIsLoading(true);
            setError(null);
            
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

            <div style={{ 
                display: "flex", 
                flexWrap: "wrap", 
                gap: "10px",
                marginBottom: "20px"
            }}>
                {commands.map((cmd, index) => (
                    <TooltipHost 
                        key={index} 
                        content={cmd.description || ""}
                        id={`cmd-tooltip-${index}`}
                    >
                        <DefaultButton
                            text={cmd.name}
                            disabled={!GLOBAL_STATE.adb || isLoading}
                            onClick={() => handleCommand(cmd.command)}
                            aria-describedby={`cmd-tooltip-${index}`}
                        >
                            {isLoading && <Spinner size={SpinnerSize.small} style={{ marginLeft: 8 }} />}
                        </DefaultButton>
                    </TooltipHost>
                ))}
            </div>

            {/* Display output */}
            {(output || error) && (
                <div style={{ marginTop: 10 }}>
                    {error ? (
                        <MessageBar messageBarType={MessageBarType.error}>
                            Error: {error}
                        </MessageBar>
                    ) : (
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
                    )}
                </div>
            )}
        </Stack>
    );
};

export default observer(Devinfo);