const assert = require('assert/strict');
const domino = require('domino');

const Node = require('domino/lib/Node');
const NodeFilter = require('domino/lib/NodeFilter');

const { TextSelection } = require('jstextselection');
const { ContentEditableElementTextSelection } = require('../index');

describe('ContentEditableElementTextSelection Test', () => {
    let createWindowAndDocumentObject = () => {
        let windowObject = domino.createWindow(
            '<div contenteditable="true">01234<span class="foo">56789<span class="bar">abcdef</span></span>ghij</div>');

        // 01234[56789{abcdef}]ghij <-- text
        // 01234 56789 012345  6789 <-- index

        let documentObject = windowObject.document;
        let activeElement = null;

        // domino 的 activeElement 属性是一个只读属性
        //
        // 拦截 activeElement 属性
        let proxyHandler = {
            get(target, property) {
                if (property === 'activeElement') {
                    return activeElement;
                } else {
                    return target[property];
                }
            },
            set(target, property, value) {
                if (property === 'activeElement') {
                    activeElement = value;
                } else {
                    target[property] = value;
                }
            }
        };

        let proxyDocumentObject = new global.Proxy(documentObject, proxyHandler)

        return {
            windowObject: windowObject,
            documentObject: proxyDocumentObject
        };
    };

    it('Test setSelection()', () => {
        let { windowObject, documentObject } = createWindowAndDocumentObject();
        let rootElement = documentObject.body.firstElementChild;
        documentObject.activeElement = rootElement;

        let ce1 = new ContentEditableElementTextSelection(rootElement, windowObject, documentObject, NodeFilter, Node);
        let textSelection1 = new TextSelection(3)

        // TODO::
        // 因为 domino 缺少 createRange() 等方法的具体实现，所以单元测试暂时无法完成。
        // ce1.setSelection(textSelection1);
    });

});