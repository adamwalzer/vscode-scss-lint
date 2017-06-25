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
    DecorationOptions,
    OverviewRulerLane,
} from 'vscode';

const exec = require('child_process').exec;
const findParentDir = require('find-parent-dir');

const {
    errorBackgroundColor,
    warningBackgroundColor,
    languages,
    statusBarText,
} = workspace.getConfiguration('scssLint');

const errorDecorationType = window.createTextEditorDecorationType({
    backgroundColor: errorBackgroundColor,
    overviewRulerColor: errorBackgroundColor,
    overviewRulerLane: 2,
});

const warningDecorationType = window.createTextEditorDecorationType({
    backgroundColor: warningBackgroundColor,
    overviewRulerColor: warningBackgroundColor,
    overviewRulerLane: 2,
});

// This method is called when your extension is activated. Activation is
// controlled by the activation events defined in package.json.
export function activate(context: ExtensionContext) {
    // create a new error finder
    let errorFinder = new ErrorFinder();
    let controller = new ErrorFinderController(errorFinder);

    // Add to a list of disposables which are disposed when this extension is deactivated.
    context.subscriptions.push(controller);
    context.subscriptions.push(errorFinder);
}

class ErrorFinder {

    private _statusBarItem: StatusBarItem;

    public finderErrors() {

        // Create as needed
        if (!this._statusBarItem) {
            this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
        }

        // Get the current text editor
        let editor = window.activeTextEditor;
        if (!editor) {
            this._statusBarItem.hide();
            return;
        }

        let doc = editor.document;

        // Only find errors if doc is an scss file
        if (~languages.indexOf(doc.languageId)) {
            const dir = (workspace.rootPath || '') + '/';
            const fileName = doc.fileName.replace(dir, '');
            let cmd = `cd ${dir} && scss-lint --config --no-color ${fileName}`;

            // Find and set nearest config file
            try {
                const configDir =  doc.fileName.substring(0, doc.fileName.lastIndexOf('/'));
                const configFileDir = findParentDir.sync(configDir, '.scss-lint.yml');
                cmd = `scss-lint -c ${configFileDir + '.scss-lint.yml'} --no-color ${doc.fileName}`;
            } catch(err) {
                console.error('error', err);
            }

            exec(cmd, (err, stdout) => {
                const activeEditor = window.activeTextEditor;
                const lines = stdout.toString().split('\n');

                const errors: DecorationOptions[] = lines.map(line => {
                    if(~line.indexOf('[E]')) {
                        const info = line.match(/[^:]*:(\d+):(\d+) \[E\] (.*)$/);
                        const lineNum = parseInt(info[1], 10) - 1;
                        const startPos = parseInt(info[2], 10) - 1;
                        const hoverMessage = info[3];
                        return { range: new Range(lineNum, startPos, lineNum + 1, 0), hoverMessage };
                    }
                }).filter(x => x);

                const warnings: DecorationOptions[] = lines.map(line => {
                    if(~line.indexOf('[W]')) {
                        const info = line.match(/[^:]*:(\d+):(\d+) \[W\] (.*)$/);
                        const lineNum = parseInt(info[1], 10) - 1;
                        const startPos = parseInt(info[2], 10) - 1;
                        const hoverMessage = info[3];
                        return { range: new Range(lineNum, startPos, lineNum + 1, 0), hoverMessage };
                    }
                }).filter(x => x);

                activeEditor.setDecorations(errorDecorationType, errors);
                activeEditor.setDecorations(warningDecorationType, warnings);

                // Update the status bar
                this._statusBarItem.text = eval(statusBarText);
                this._statusBarItem.show();
            });
        } else {
            this._statusBarItem.hide();
        }
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
        this._errorFinder.finderErrors();

        // subscribe to selection change and editor activation events
        let subscriptions: Disposable[] = [];
        workspace.onDidSaveTextDocument(this._onEvent, this, subscriptions);
        window.onDidChangeActiveTextEditor(this._onEvent, this, subscriptions);

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
