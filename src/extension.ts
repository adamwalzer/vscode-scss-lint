// The module 'vscode' contains the VS Code extensibility API
// Import the necessary extensibility types to use in your code below
import {
    window,
    commands,
    workspace,
    Disposable,
    ExtensionContext,
    StatusBarAlignment,
    StatusBarItem,
    TextDocument,
    Range,
    languages as langs,
    DecorationOptions,
    OverviewRulerLane,
    DiagnosticCollection,
    DiagnosticSeverity,
    Diagnostic,
    Uri,
} from 'vscode';

const exec = require('child_process').exec;
const findParentDir = require('find-parent-dir');
const glob = require("glob");
const fs = require('fs');

let {
    errorBackgroundColor,
    warningBackgroundColor,
    languages,
    statusBarText,
    showHighlights,
    runOnTextChange,
    configDir,
} = workspace.getConfiguration('scssLint');

let errorDecorationType;
let warningDecorationType;

const updateConfig = () => {
    const newConfig: any = workspace.getConfiguration('scssLint');
    errorBackgroundColor = newConfig.errorBackgroundColor;
    warningBackgroundColor = newConfig.warningBackgroundColor;
    languages = newConfig.languages;
    statusBarText = newConfig.statusBarText;
    showHighlights = newConfig.showHighlights;
    runOnTextChange = newConfig.runOnTextChange;
    configDir = newConfig.configDir;

    errorDecorationType = window.createTextEditorDecorationType({
        backgroundColor: errorBackgroundColor,
        overviewRulerColor: errorBackgroundColor,
        overviewRulerLane: 2,
    });

    warningDecorationType = window.createTextEditorDecorationType({
        backgroundColor: warningBackgroundColor,
        overviewRulerColor: warningBackgroundColor,
        overviewRulerLane: 2,
    });
};

const isWindows = /^win/.test(process.platform);
const SEPARATOR = isWindows ? '\\' : '/';
const DIR_END_CHAR = isWindows ? SEPARATOR : ''; // need \\ for windows
const Q = isWindows ? '' : '"';
const CONFIG_OBJ = isWindows ? {env: {NL: '^& echo.', AMP: '^^^&', PIPE: '^^^|', CHEV: '^^^>'}} : null;

const getDocCopy = (docText) => (
    isWindows ?
    docText.replace(/\r\n/g, '%NL%').replace(/\&/g, '%AMP%').replace(/\|/g, '%PIPE%').replace(/\>/g, '%CHEV%') :
    docText.replace(/\\/g, '\\\\\\').replace(/\`/g, '\\`').replace(/\$/g, '\\$').replace(/\"/g, '\\"')
);

// This method is called when your extension is activated. Activation is
// controlled by the activation events defined in package.json.
export function activate(context: ExtensionContext) {
    // create a new error finder
    updateConfig();

    let errorFinder = new ErrorFinder();
    let controller = new ErrorFinderController(errorFinder);

    // Add to a list of disposables which are disposed when this extension is deactivated.
    context.subscriptions.push(controller);
    context.subscriptions.push(errorFinder);
}

class ErrorFinder {

    private _statusBarItem: StatusBarItem;

    private _diagnosticCollection: DiagnosticCollection;

    constructor() {
        this._diagnosticCollection = langs.createDiagnosticCollection();
        this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
    }

    public finderErrors() {

        // Create as needed
        if (!this._statusBarItem) return;

        // Get the current text editor
        const editor = window.activeTextEditor;
        if (!editor) {
            this._statusBarItem.hide();
            return;
        }

        updateConfig();

        let doc = editor.document;

        // Only find errors if doc languageId is in languages array
        if (!~languages.indexOf(doc.languageId)) {
            this._statusBarItem.hide();
            return;
        }

        let configFileDir = configDir || '';

        if (!configFileDir) {
            // Find and set nearest config file
            try {
                const startingDir = doc.fileName.substring(0, doc.fileName.lastIndexOf(SEPARATOR));
                configFileDir = findParentDir.sync(startingDir, '.scss-lint.yml') + DIR_END_CHAR;
            } catch(err) {
                console.error('error', err);
            }
        }

        const scssLintPath = configFileDir && configFileDir !== 'null' ? configFileDir + '.scss-lint.yml' : '';

        let exclude;
        try {
            const scssLint = fs.readFileSync(scssLintPath, 'utf8') || '';
            exclude = scssLint.match(new RegExp('^exclude:(.*)', 'im'));
        } catch(err) {
            console.error('error', err);
        }

        if (exclude && exclude[1]) {
            const excludePath = configFileDir + exclude[1].trim().replace(new RegExp('[\'"]', 'g'), '');
            const excludeFiles = glob.sync(excludePath, {});
            if (excludeFiles && excludeFiles.indexOf(doc.fileName) > -1) {
                return; // this file should be excluded
            }
        }

        const dir = configFileDir || ((workspace.rootPath || '') + SEPARATOR); // workspace.rootPath may be null on windows
        const fileName = doc.fileName.replace(dir, '');
        const docCopy = `${Q}${getDocCopy(doc.getText())}${Q}`;
        const configCmd = scssLintPath ? `-c "${scssLintPath}" ` : '';
        const cmd = `cd "${dir}" && echo ${docCopy}| scss-lint ${configCmd} --stdin-file-path="${fileName}"`;

        exec(cmd, CONFIG_OBJ, (err, stdout) => {
            const lines = stdout.toString().split('\n');

            const {
                exits,
                errors,
                warnings,
                diagnostics,
            } = lines.reduce((a, line) => {
                let info,
                    severity;

                line = line.trim();

                if(~line.indexOf('[E]')) {
                    info = line.match(/[^:]*:(\d+):(\d+) \[E\] (.*)$/);
                    severity = DiagnosticSeverity.Error;
                } else if(~line.indexOf('[W]')) {
                    info = line.match(/[^:]*:(\d+):(\d+) \[W\] (.*)$/);
                    severity = DiagnosticSeverity.Warning;
                } else if (line) {
                    info = [1, 1, 1, 'Error running scss-lint: ' + line];
                } else {
                    return a;
                }

                const lineNum = parseInt(info[1], 10) - 1;
                const startPos = parseInt(info[2], 10) - 1;
                const message = info[3];
                const range = new Range(lineNum, startPos, lineNum + 1, 0);

                if(severity === DiagnosticSeverity.Error) {
                    a.errors.push({ range, message });
                    a.diagnostics.push(new Diagnostic(range, message, severity));
                } else if(severity === DiagnosticSeverity.Warning) {
                    a.warnings.push({ range, message });
                    a.diagnostics.push(new Diagnostic(range, message, severity));
                } else {
                    severity === DiagnosticSeverity.Error;
                    a.exits.push(new Diagnostic(range, message, severity));
                }

                return a;
            }, {
                exits: [],
                errors: [],
                warnings: [],
                diagnostics: [],
            });

            if (editor === window.activeTextEditor) {
                if (showHighlights) {
                    editor.setDecorations(errorDecorationType, errors);
                    editor.setDecorations(warningDecorationType, warnings);
                }

                const configUri = Uri.parse(configFileDir + '.scss-lint.yml').with({scheme: 'file'});
                this._diagnosticCollection.set(configUri, exits);
                this._diagnosticCollection.set(doc.uri, diagnostics);

                // Update the status bar
                this._statusBarItem.text = eval(statusBarText);
                this._statusBarItem.show();
            }
        });
    }

    dispose() {
        this._statusBarItem.dispose();
    }
}

class ErrorFinderController {

    private _errorFinder: ErrorFinder;
    private _disposable: Disposable;

    constructor(errorFinder: ErrorFinder) {
        this._errorFinder = errorFinder;

        // subscribe to selection change and editor activation events
        let subscriptions: Disposable[] = [];
        workspace.onDidSaveTextDocument(this._onEvent, this, subscriptions);
        window.onDidChangeActiveTextEditor(this._onEvent, this, subscriptions);

        if (runOnTextChange) {
            workspace.onDidChangeTextDocument(this._onEvent, this, subscriptions);
        }

        // update the error finder for the current file
        this._errorFinder.finderErrors();

        // create a combined disposable from both event subscriptions
        this._disposable = Disposable.from(...subscriptions);
    }

    dispose() {
        this._disposable.dispose();
    }

    private _onEvent() {
        this._errorFinder.finderErrors();
    }
}
