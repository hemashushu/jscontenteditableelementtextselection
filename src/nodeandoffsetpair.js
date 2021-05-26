/**
 * 一对 NodeAndOffset 对象，表示文本选择范围。
 */
class NodeAndOffsetPair {
    /**
     *
     * @param {*} start NodeAndOffset instance, position include
     * @param {*} end NodeAndOffset instance, position exclude
     */
    constructor(start, end) {
        this.start = start;
        this.end = end;
    }
}

module.exports = NodeAndOffsetPair;