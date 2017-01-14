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

let exec = require('child_process').exec;

const errorDecorationType = window.createTextEditorDecorationType({
    backgroundColor: 'rgba(200, 0, 0, .8)',
});

// This method is called when your extension is activated. Activation is
// controlled by the activation events defined in package.json.
export function activate(context: ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error).
    // This line of code will only be executed once when your extension is activated.
    console.log('Congratulations, your extension "WordCount" is now active!');

    // create a new word counter
    let wordCounter = new WordCounter();
    let controller = new WordCounterController(wordCounter);

    // Add to a list of disposables which are disposed when this extension is deactivated.
    context.subscriptions.push(controller);
    context.subscriptions.push(wordCounter);
}

class WordCounter {

    private _statusBarItem: StatusBarItem;

    public updateWordCount() {

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

        // Only update status if an MarkDown file
        if (doc.languageId === "scss") {
            let wordCount = this._getWordCount(doc);

            let activeEditor = window.activeTextEditor;
            let errors: DecorationOptions[] = [];
            let fileName = doc.fileName;
            let dir = (workspace.rootPath || '') + '/';
            fileName = fileName.replace(dir, '');
            let cmd = `cd ${dir} && scss-lint --no-color ${fileName}`;

            exec(cmd, function (err, stdout, stderr) {
                let lines = stdout.toString().split('\n');
                for(let i = 0; i < lines.length; i++) {
                    let info = lines[i];
                    if(~info.indexOf('[E]')) {
                        info = info.substr(info.indexOf(':') + 1);
                        const lineNum = parseInt(info.substr(0, info.indexOf(':')), 10) - 1;
                        info = info.substr(info.indexOf(':') + 1);
                        const startPos = parseInt(info.substr(0, info.indexOf(' ')), 10) - 1;
                        info = info.substr(info.indexOf(' ') + 1);
                        info = info.replace('[E] ', '');
                        errors.push({ range: new Range(lineNum, startPos, lineNum + 1, 0), hoverMessage: info });
                    }
                }
                activeEditor.setDecorations(errorDecorationType, errors);
            });

            // Update the status bar
            this._statusBarItem.text = wordCount !== 1 ? `$(pencil) ${wordCount} Words` : '$(pencil) 1 Word';
            this._statusBarItem.show();
        } else {
            this._statusBarItem.hide();
        }
    }

    public _getWordCount(doc: TextDocument): number {

        let docContent = doc.getText();

        // Parse out unwanted whitespace so the split is accurate
        docContent = docContent.replace(/(< ([^>]+)<)/g, '').replace(/\s+/g, ' ');
        docContent = docContent.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
        let wordCount = 0;
        if (docContent != "") {
            wordCount = docContent.split(" ").length;
        }

        return wordCount;
    }

    dispose() {
        this._statusBarItem.dispose();
    }
}

class WordCounterController {

    private _wordCounter: WordCounter;
    private _disposable: Disposable;

    constructor(wordCounter: WordCounter) {
        this._wordCounter = wordCounter;
        this._wordCounter.updateWordCount();

        // subscribe to selection change and editor activation events
        let subscriptions: Disposable[] = [];
        workspace.onDidSaveTextDocument(this._onEvent, this, subscriptions);
        window.onDidChangeActiveTextEditor(this._onEvent, this, subscriptions);

        // update the counter for the current file
        this._wordCounter.updateWordCount();

        // create a combined disposable from both event subscriptions
        this._disposable = Disposable.from(...subscriptions);
    }

    dispose() {
        this._disposable.dispose();
    }

    private _onEvent() {
        this._wordCounter.updateWordCount();
    }
}
