export default class CodeStream {
    readonly #indentationSize = 4;
    readonly #parent;
    #depth = 0;
    #contents = '';
    public constructor(parent?: CodeStream){
        this.#parent = parent;
    }
    public value() {
        const out = this.#maybeParent().#contents;
        this.#maybeParent().#contents = '';
        return out;
    }
    public write(value: string): void;
    public write(start: string, fn: () => void, end: string): void;
    public write(start: string, fn?: () => void, end?: string): void {
        this.append(this.#indent(start));
        if(typeof fn === 'undefined' || typeof end === 'undefined') {
            return;
        }
        this.#incrementDepth(1);
        fn();
        this.#incrementDepth(-1);
        this.append(this.#indent(end));
    }
    public append(value: string) {
        this.#maybeParent().#contents += value;
    }
    public indentBlock(fn: () => void) {
        this.#incrementDepth(1);
        fn();
        this.#incrementDepth(-1);
    }
    #maybeParent(): CodeStream {
        if(this.#parent) {
            return this.#parent.#maybeParent();
        }
        return this;
    }
    #indent(value: string) {
        const depth = this.#maybeParent().#depth;
        for(let j = 0; j < depth; j++) {
            for(let i = 0; i < this.#indentationSize; i++) {
                value = ` ${value}`;
            }
        }
        return value;
    }
    #incrementDepth(value: -1 | 1) {
        this.#maybeParent().#depth += value;
    }
}
