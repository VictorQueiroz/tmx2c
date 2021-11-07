import { Element, Node } from "libxmljs";

/**
 * @deprecated
 */
export function isValidNumber(val: string) {
    const n = parseInt(val,10);
    return !Number.isNaN(n) && Number.isFinite(n);
}

export function isString(val: unknown): val is string {
    return typeof val === 'string';
}

export function isNumber(val: unknown): val is number {
    return typeof val === 'number';
}

export function isElement(el: Node): el is Element {
    return el.type() === 'element';
}

export function readString(el: Element, key: string): string | null {
    const attr = el.attr(key);
    if(attr === null) {
        return null;
    }
    return attr.value();
}

/**
 * Read an integer parameter
 * @returns a number or null in case the parameter either does not exist or it is an invalid number
 */
export function readInt(el: Element, key: string): number | null {
    const attr = el.attr(key);
    if(attr === null) return null;
    const val = parseInt(attr.value(),10);
    if(!Number.isInteger(val)) {
        return null;
    }
    return val;
}
