// cspell: ignore bootloader
// cspell: ignore fastboot

import {
    DefaultButton,
    Dialog,
    DialogFooter,
    DialogType,
    Dropdown,
    IStackTokens,
    MessageBar,
    MessageBarType,
    PrimaryButton,
    Separator,
    SpinButton,
    Spinner,
    SpinnerSize,
    Stack,
    Text,
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

interface CommandOption {
    value: string;
    label: string;
}

interface CommandParam {
    name: string;
    label: string;
    placeholder?: string;
}

interface Command {
    name: string;
    command?: string;
    commandTemplate?: string;
    description?: string;
    type?: "dropdown" | "number" | "multiInput";
    options?: CommandOption[];
    min?: number;
    max?: number;
    params?: CommandParam[];
}

interface CommandCategory {
    category: string;
    commands: Command[];
}

// Type assertion to make TypeScript understand our data structure
const typedCommandData = commandsData as CommandCategory[];

const stackTokens: IStackTokens = {
    childrenGap: 10,
};

const Devinfo: NextPage = () => {
    const [output, setOutput] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [commandCategories, setCommandCategories] = useState<CommandCategory[]>([]);
    const [activeCommand, setActiveCommand] = useState<string | null>(null);
    const [dialogVisible, setDialogVisible] = useState<boolean>(false);
    const [currentCommand, setCurrentCommand] = useState<Command | null>(null);
    const [dropdownValue, setDropdownValue] = useState<string>("");
    const [numberValue, setNumberValue] = useState<string>("");
    const [paramValues, setParamValues] = useState<Record<string, string>>({});
    const [debugInfo, setDebugInfo] = useState<string>("");

    useEffect(() => {
        // Set commands from imported data
        setCommandCategories(typedCommandData);

        // Debug: log the data structure
        console.log("Command Categories:", typedCommandData);
        setDebugInfo(`Found ${typedCommandData.length} categories`);
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

    const handleCommandClick = (command: Command) => {
        if (command.command) {
            // Regular command, execute directly
            handleCommand(command.command);
        } else if (command.commandTemplate) {
            // Special command type that needs parameter input
            setCurrentCommand(command);

            // Reset values for dialog
            setDropdownValue(command.options && command.options.length > 0 ? command.options[0].value : "");
            setNumberValue(command.min !== undefined ? String(command.min) : "0");

            if (command.params) {
                const initialParams: Record<string, string> = {};
                command.params.forEach(param => {
                    initialParams[param.name] = "";
                });
                setParamValues(initialParams);
            }

            setDialogVisible(true);
        }
    };

    const handleDialogConfirm = () => {
        if (!currentCommand || !currentCommand.commandTemplate) return;

        let finalCommand = currentCommand.commandTemplate;

        if (currentCommand.type === "dropdown") {
            finalCommand = finalCommand.replace("{value}", dropdownValue);
        } else if (currentCommand.type === "number") {
            finalCommand = finalCommand.replace("{value}", numberValue);
        } else if (currentCommand.type === "multiInput" && currentCommand.params) {
            currentCommand.params.forEach(param => {
                finalCommand = finalCommand.replace(`{${param.name}}`, paramValues[param.name] || "");
            });
        }

        setDialogVisible(false);
        handleCommand(finalCommand);
    };

    const validateNumberInput = (value: string): boolean => {
        if (!currentCommand) return false;

        const num = Number(value);
        const min = currentCommand.min !== undefined ? currentCommand.min : 0;
        const max = currentCommand.max !== undefined ? currentCommand.max : 100;

        return !isNaN(num) && num >= min && num <= max;
    };

    const handleNumberInputChange = (value: string): void => {
        if (value === "" || validateNumberInput(value)) {
            setNumberValue(value);
        }
    };

    const handleParamChange = (paramName: string, value: string): void => {
        setParamValues(prev => ({
            ...prev,
            [paramName]: value
        }));
    };

    const renderDialogContent = () => {
        if (!currentCommand) return null;

        switch (currentCommand.type) {
            case "dropdown":
                return (
                    <Dropdown
                        label={currentCommand.description || "Select option"}
                        selectedKey={dropdownValue}
                        onChange={(_, option) => option && setDropdownValue(option.key as string)}
                        options={currentCommand.options?.map(opt => ({
                            key: opt.value,
                            text: opt.label
                        })) || []}
                    />
                );
            case "number":
                return (
                    <SpinButton
                        label={currentCommand.description || "Enter value"}
                        min={currentCommand.min}
                        max={currentCommand.max}
                        value={numberValue}
                        onValidate={(value) => {
                            handleNumberInputChange(value);
                        }}
                        onChange={(_, value) => {
                            if (value !== undefined) {
                                handleNumberInputChange(value);
                            }
                        }}
                    />
                );
            case "multiInput":
                return (
                    <Stack tokens={stackTokens}>
                        {currentCommand.params?.map((param, index) => (
                            <TextField
                                key={index}
                                label={param.label}
                                placeholder={param.placeholder}
                                value={paramValues[param.name] || ""}
                                onChange={(_, value) => handleParamChange(param.name, value || "")}
                            />
                        ))}
                    </Stack>
                );
            default:
                return null;
        }
    };

    const areParamsValid = (): boolean => {
        if (!currentCommand) return false;

        switch (currentCommand.type) {
            case "dropdown":
                return dropdownValue !== "";
            case "number":
                return validateNumberInput(numberValue);
            case "multiInput":
                if (!currentCommand.params) return true;
                return currentCommand.params.every(param => paramValues[param.name]?.trim() !== "");
            default:
                return true;
        }
    };

    return (
        <Stack {...RouteStackProps}>
            <Head>
                <title>Device Info - Tango</title>
            </Head>

            <div style={{ marginBottom: 20 }}>
                <MessageBar messageBarType={MessageBarType.info}>
                    Select a command to execute on the device {debugInfo ? `(${debugInfo})` : ""}
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
                {commandCategories && commandCategories.length > 0 ? (
                    commandCategories.map((category, categoryIndex) => (
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
                                {category.commands && category.commands.map((cmd, index) => (
                                    <TooltipHost
                                        key={index}
                                        content={cmd.description || ""}
                                        id={`cmd-tooltip-${categoryIndex}-${index}`}
                                    >
                                        <DefaultButton
                                            text={cmd.name}
                                            disabled={!GLOBAL_STATE.adb || isLoading}
                                            onClick={() => handleCommandClick(cmd)}
                                            aria-describedby={`cmd-tooltip-${categoryIndex}-${index}`}
                                        />
                                    </TooltipHost>
                                ))}
                            </div>
                        </div>
                    ))
                ) : (
                    <MessageBar messageBarType={MessageBarType.warning}>
                        No command categories found
                    </MessageBar>
                )}
            </div>

            {/* Parameter Dialog */}
            <Dialog
                hidden={!dialogVisible}
                onDismiss={() => setDialogVisible(false)}
                dialogContentProps={{
                    type: DialogType.normal,
                    title: currentCommand?.name || "Enter Parameters",
                    subText: currentCommand?.description
                }}
                minWidth={400}
            >
                {renderDialogContent()}

                <DialogFooter>
                    <PrimaryButton
                        onClick={handleDialogConfirm}
                        text="Confirm"
                        disabled={!areParamsValid()}
                    />
                    <DefaultButton
                        onClick={() => setDialogVisible(false)}
                        text="Cancel"
                    />
                </DialogFooter>
            </Dialog>
        </Stack>
    );
};

export default observer(Devinfo);