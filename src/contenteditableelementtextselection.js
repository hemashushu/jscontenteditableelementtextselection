const { IllegalArgumentException, UnsupportedOperationException } = require('jsexception');
const { TextSelection } = require('jstextselection');

const NodeAndOffset = require('./nodeandoffset');
const NodeAndOffsetPair = require('./nodeandoffsetpair');

/**
 * 为带有 contenteditable 属性的元素（即内容可编辑元素）添加光标/位置的获取及
 * 设置功能，同时添加一个便于读写位置值的属性 selection。
 *
 * 带有 contenteditable 属性的元素类似一个“富文本”编辑框，常用于编辑带有格式、
 * 或者较长的文本，然后在里面使用 <span> 标签为文本的各个部分加上样式，比如粗体、
 * 斜体、字体大小、颜色等。注意可编辑元素里面不要使用 <div> 来格式化文本，只能使用
 * <span> 标签。
 *
 * 本类能够使用光标/位置值（即 position）定位编辑元素里面的每一个位置（或字符），
 * 就像对待纯文本编辑框（<textarea>）一样，无视元素的所有格式和样式。
 * position 的概念跟字符索引（index）不太一样，详细
 * 请见 'jstextselection' 包的说明，简单来说，
 * position 是字符之间的位置，而 offset 是对应的字符的位置。比如：
 *
 * -------------------
 * |0 1 2 3 4 5 6 7 8 <-- position
 * | a b{c d e}f g h  <-- 文本，其中 {} 是指光标的开始和结束位置
 * | 0 1 2 3 4 5 6 7  <-- offset
 * -------------------
 *
 * 注意：
 * 可编辑元素的内容不能太大，目前的浏览器一般支持最多 4k 个字符的带格式的
 * 文本，如果文本再大，则有明显的响应延迟（latency）问题。
 *
 * 参考资料（Web API reference）:
 *  - Selection
 *    https://developer.mozilla.org/en-US/docs/Web/API/Selection
 *  - Range
 *    https://developer.mozilla.org/en-US/docs/Web/API/Range
 *    Note that the startOffset is include and the endOffset is EXCLUDE.
 *  - Node.compareDocumentPosition()
 *    https://developer.mozilla.org/en-US/docs/Web/API/Node/compareDocumentPosition
 *  - Document.createTreeWalker()
 *    https://developer.mozilla.org/en-US/docs/Web/API/Document/createTreeWalker
 *
 */
class ContentEditableElementTextSelection {

    constructor(contentEditableElement) {
        this.contentEditableElement = contentEditableElement;
    }

    /**
     * 根据一对光标/位置（position）获取编辑框里相应的
     * 一对 “节点及相对节点的位置偏移值” （即一对 NodeAndOffset）。
     *
     * - 编辑框是指 content editable element；
     * - position 是指编辑框的字符的位置，无视编辑框内文字和段落的格式和样式；
     * - 编辑框内只能包含 <span> 标签，不能使用 <div> 标签。
     *
     * @param {*} startPosition 待搜索的光标/位置的值的开始位置
     * @param {*} endPosition 待搜索的光标/位置的值的结束位置
     * @returns 返回 [NodeAndOffset, ...]，
     *     正常情况下返回的是 2 个元素，但也有可能因为 startPosition 和 endPosition
     *     的值相同，或者超出范围而只返回 1 个元素。
     */
    findNodeAndOffsets(startPosition, endPosition) {

        let nodeAndOffsets = []; // 待返回的结果，一个 NodeAndOffset 对象数组

        // 为了简化程序，把 startPosition, endPosition 装到一个数组里，使用同一个
        // 循环比较过程。
        let positionPair = [startPosition, endPosition];
        let position = positionPair.shift(); // current searching postition.

        let workerPosStart = 0; // current node start position, equals to 'offset', include
        let workerPosEnd = 0;   // current node end position, equals to 'offset', include

        let treeWalker = document.createTreeWalker(this.contentEditableElement, NodeFilter.SHOW_TEXT);
        while (treeWalker.nextNode()) {
            let currentNode = treeWalker.currentNode;
            let nodeValue = currentNode.nodeValue;

            let nodeValueLength = (nodeValue === null) ? 0 : nodeValue.length;
            workerPosEnd = workerPosStart + nodeValueLength - 1; // 因为 end position 对应的字符也是被包含的，所以需要减去 1。

            // 检查当前搜索位置是否在当前节点之内
            while (position >= workerPosStart && position <= workerPosEnd) {
                // 添加到结果
                nodeAndOffsets.push(new NodeAndOffset(currentNode, position - workerPosStart));

                if (positionPair.length === 0) {
                    // 已经到达待搜索位置的尽头，返回结果
                    return nodeAndOffsets;
                }

                // 检查下一个搜索位置是否也在当前节点之内
                position = positionPair.shift();
            }

            // 搜索下一个节点
            workerPosStart += nodeValueLength;
        }

        // 为什么程序会运行到这里呢？
        //
        // 1. 因为上面 workerPosEnd 被设定为字符包括
        //    （什么是字符包括？比如函数 String.substring(start, end) 当中的
        //    start 是字符包括的，而 end是不包括的。），
        //    而 endPosition 参数是位置值，有可能其值刚好是文本的末尾，比如：
        //
        //    0 1 2 3 4 5 <-- endPosition: 5
        //     a b[c d e] <-- text
        //     0 1 2 3 4  <-- workerPosStart/workerPosEnd，相当于字符索引（offset）
        //
        //    上面的搜索只能到达字母 “e”，即 offset 4，而 endPosition 5 因为大于 4 而
        //    导致来到这里。
        //    至于 workerPosEnd 为什么要设定为字符包含，而不是类似 substring() 函数的 end
        //    设定为索引值 +1，因为比较 startPosition 时是字符包含的，所以为简化程序，
        //    在比较时都设定为字符包含。
        //
        // 2. 有可能 endPosition 的值超出了文本的范围，对于这种情况，当前方法直接忽略，使用文本
        //    的实际长度代替请求的位置。

        let lastNode = treeWalker.currentNode;
        let lastNodeValue = lastNode.nodeValue;
        let lastNodeValueLength = (lastNodeValue === null) ? 0 : lastNode.nodeValue.length;
        let lastOffset = lastNodeValueLength; // exclude
        let lastNodeAndOffset = new NodeAndOffset(lastNode, lastOffset);

        // 上面的 lastOffset 是字符 **不包括** 的，所以不需要减去 1。
        // 至于为什么要设定为字符不包括，因为当前方法主要用来获取一对光标/位置然后
        // 用于构建一个 DOM Range，对于 Range，第 2 个位置是字符不包含的。

        nodeAndOffsets.push(lastNodeAndOffset);

        return nodeAndOffsets;
    }

    /**
     * 根据 TextSelection 对象（光标/位置的开始和结束位置）获取一对 NodeAndOffset 对象。
     *
     * @param {*} textSelection
     * @returns
     */
    findNodeAndOffsetPairByTextSelection(textSelection) {
        let nodeAndOffsets = this.findNodeAndOffsets(textSelection.start, textSelection.end);

        // 当编辑框的内容为空时，TextSelection 的值将会是 (0,0)，又或者
        // 当 TextSelection 的值折叠时（即 start === end），findNodeAndOffsets 方法
        // 只会返回 1 个元素的数组，遇到这种情况时，复制索引 0 元素为索引 1 元素。

        if (nodeAndOffsets.length === 1 &&
            textSelection.start === textSelection.end) {
            nodeAndOffsets.push(nodeAndOffsets[0]);
        }

        if (nodeAndOffsets.length !== 2) {
            throw IllegalArgumentException('The value of TextSelection is out of text range.');
        }

        return new NodeAndOffsetPair(
            nodeAndOffsets[0],
            nodeAndOffsets[1]);
    }

    findNodeAndOffsetPairsByTextSelections(textSelections) {
        let nodeAndOffsetPairs = [];
        for (let textSelection of textSelections) {
            let nodeAndOffsetPair = this.findNodeAndOffsetPairByTextSelection(textSelection);
            nodeAndOffsetPairs.push(nodeAndOffsetPair);
        }
        return nodeAndOffsetPairs;
    }

    /**
     * 根据 TextSelection 创建 DOM Range 对象。
     * @param {*} textSelection
     * @returns
     */
    createRange(textSelection) {
        // 确保 textSelection.end >= textSelection.start
        if (textSelection.start > textSelection.end) {
            let swapValue = textSelection.end;
            textSelection.end = textSelection.start;
            textSelection.start = swapValue;
        }

        let nodeAndOffsetPair = this.findNodeAndOffsetPairByTextSelection(textSelection);

        let range = document.createRange();
        range.setStart(nodeAndOffsetPair.start.node, nodeAndOffsetPair.start.offset);
        range.setEnd(nodeAndOffsetPair.end.node, nodeAndOffsetPair.end.offset);
        return range;
    }

    /**
     * 根据指定的节点以及相对（节点）偏移值获取指定光标/位置的值
     *
     * @param {*} node
     * @param {*} offset
     * @returns 返回的是光标/位置值，此值相对编辑框而言，即编辑框的第 1 个字符的前面
     *     位置值为 0。
     */
    getPosition(node, offset) {
        // 检查指定的节点是否在编辑框内部
        if ((this.contentEditableElement.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_CONTAINED_BY) ===
            Node.DOCUMENT_POSITION_CONTAINED_BY) {
            // pass
        } else if (this.contentEditableElement === node) {
            // 编辑框内部是空的，没有任何节点（连文字节点 TEXTNODE 都没有）
            return 0;
        } else {
            // 指定的节点不在编辑框之内
            throw new IllegalArgumentException('The specified node is out of the content editable element.');
        }

        // 获取光标/位置（相对于编辑框）的值的方法是：
        // 1. 初始偏移值 +
        // 2. 当前节点所有同级的前面所有节点（previous sibling）的文本内容的长度 +
        // 3. 到达同级节点的第 1 个节点之后，往上一层移动，
        // 4. 重复以上步骤，一直到达编辑框为止
        //
        // 即：
        // position =
        //   offset + (
        //     all parent nodes (
        //       all previous sibling text content length
        //     )
        //   )

        let cursorNode = node;
        let position = offset;

        // 有关 Range.startOffset 的描述：
        //
        // The Range.startOffset read-only property returns a number representing
        // where in the startContainer the Range starts.
        //
        // If the startContainer is a Node of type Text, Comment, or CDATASection,
        // then the offset is the number of characters from the start of the
        // startContainer to the boundary point of the Range. For other Node types,
        // the startOffset is the number of child nodes between the start of the
        // startContainer and the boundary point of the Range.
        //
        // 出自：
        // https://developer.mozilla.org/en-US/docs/Web/API/Range
        // https://developer.mozilla.org/en-US/docs/Web/API/Range/startOffset

        if (cursorNode.hasChildNodes() && offset > 0) {
            cursorNode = cursorNode.childNodes[offset - 1];
            position = cursorNode.textContent.length;
        }

        // 不断往上层查找，一直到达编辑框本身为止
        while (cursorNode !== this.contentEditableElement) {

            let parent = cursorNode.parentNode;

            // 不断往同级的前面节点（previous sibling）移动，每次移动时均累加
            // 之前节点的文本内容的长度
            while ((cursorNode = cursorNode.previousSibling) !== null) {
                if (cursorNode.textContent) {
                    position += cursorNode.textContent.length;
                }
            }

            // 到达同级的第一个节点时，再往上层移动。
            cursorNode = parent;
        }

        return position;
    }

    /**
     * 选中指定的范围的文本。
     *
     * @param {*} textSelection 请注意 TextSelection.start 是字符包含的，
     *     而 TextSelection.end 是字符**不**包含的。
     * @returns
     */
    setSelection(textSelection) {
        // https://developer.mozilla.org/en-US/docs/Web/API/Document/activeElement
        let activeElement = document.activeElement;
        if (activeElement !== this.contentEditableElement) {
            throw new UnsupportedOperationException('The active element is not the specified content editable element.');
        }

        let range = this.createRange(textSelection);
        let selection = window.getSelection();

        // 选定文本的正常流程是先使用 selection.removeAllRanges() 方法把旧的所有选中的
        // Range 清除，然后再使用 selection.addRange(range) 方法选中指定文本，但
        // removeAllRanges() 方法似乎有性能问题。
        //
        // https://developer.mozilla.org/en-US/docs/Web/API/Range
        // https://w3c.github.io/selection-api/
        // http://stackoverflow.com/questions/26819647/removeallranges-slow-in-chrome-alternatives
        //
        // 这里使用的是 selection.setBaseAndExtent() 方法。

        selection.setBaseAndExtent(
            range.startContainer, range.startOffset,
            range.endContainer, range.endOffset);

        return range;
    }

    /**
     * 获取编辑框的选中状态信息（即 TextSelection 对象）
     *
     * @returns 返回 TextSelection 对象
     *     - 如果没有任何内容被选中，即
     *       没有光标在文本框中，则此方法返回 undefined。
     *     - 如果编辑框不是活动元素（即有焦点的元素），则抛出
     *       UnsupportedOperationException 异常。
     */
    getSelection() {
        // https://developer.mozilla.org/en-US/docs/Web/API/Document/activeElement
        let activeElement = document.activeElement;
        if (activeElement !== this.contentEditableElement) {
            throw new UnsupportedOperationException('The content editable element is not the active element.');
        }

        let selection = window.getSelection();
        if (selection.rangeCount === 0) {
            // 当没有任何选中的内容时（连光标都没有），则返回 undefined
            return;
        }

        // 关于 DOM Node 对象:
        //
        // 它有可能是一个文本节点（即仅有文字没有标签的节点）：
        // Node.nodeType: TEXT_NODE =3
        // Node.nodeName: the '#text' string.
        //
        // https://developer.mozilla.org/en-US/docs/Web/API/Node

        // 有关 Range 对象的 startContainer/endContainer 和
        // Selection 对象的 anchorNode/focusNode 的区别：
        // Range.endContainer 始终 > Range.startContainer
        // 但
        // 当用户是从右向左选中文本时（假设文本由左向右显示、阅读），
        // Selection.anchorNode (start) 会大于 Selection.focusNode (end)。

        let range = selection.getRangeAt(0);
        let startPosition = this.getPosition(range.startContainer, range.startOffset);

        if (TextSelection.isCollapsed(selection)) {
            // 光标是折叠的，即只有光标，但没有选中 1 个或多个字符。
            return new TextSelection(startPosition);
        } else {
            if (range.startContainer === range.endContainer) {
                return new TextSelection(
                    startPosition,
                    startPosition + (range.endOffset - range.startOffset));
            } else {
                // end position 同时也等于: startPosition + range.toString().length
                let endPosition = this.getPosition(range.endContainer, range.endOffset);
                return new TextSelection(startPosition, endPosition);
            }
        }
    }

    /**
     * 向 content editable element （编辑框）添加 'selection' 属性。
     *
     * 便于读/写编辑框的位置信息。
     */
    injectSelectionProperty() {
        Object.defineProperty(this.contentEditableElement, 'selection', {
            get: () => {
                // 注意这里不要使用 function() {...} 来定义方法体，因为 function 有
                // 自己的 this，即方法的 this 总是指向点号之前的对象，比如
                // someObject.someFunc()
                // 在 someFunc() 方法体中的 this 指向 someObject 对象。
                //
                // 而当前方法是添加 '.selection' getter/setter 到 textBoxControlElement
                // 所以当访问 someElement.selection 时，selection 方法体内部的 this 将会
                // 指向 someElement，而不是 ContentEditableElementTextSelection.
                //
                // 而箭头函数没有自己的 this 对象，所以能正确指向当前
                // ContentEditableElementTextSelection 对象。
                return this.getSelection();
            },
            set: (value) => {
                this.setSelection(value);
            },

            enumerable: true,
            configurable: true
        });
    }
}

module.exports = ContentEditableElementTextSelection;