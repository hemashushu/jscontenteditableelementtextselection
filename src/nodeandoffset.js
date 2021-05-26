/**
 * 表示一个光标/位置的信息
 */
class NodeAndOffset {
    /**
     *
     * @param {*} node 光标/位置所在的节点（Dom Node）。
     * @param {*} offset 光标/位置距离节点开始位置的偏移值。
     */
    constructor(node, offset) {
        this.node = node;
        this.offset = offset;
    }
}

module.exports = NodeAndOffset;