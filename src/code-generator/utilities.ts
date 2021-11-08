const hasExplicitFractionalPart = /\.[0-9]+$/;

// 1.0e100 or 1.0E100
// 1e20 or 1E20
// -1e20 or 1E20
const isScientificNotation = /^-?[0-9]+(\.[0-9])?[eE]-?[0-9]+$/;

export function jsNumberToCFloat(val: string) {
    if(isScientificNotation.test(val)) {
        val = `${val}`;
    } else if(!hasExplicitFractionalPart.test(val)) {
        val = `${val}.0`;
    }
    return `${val}f`;
}

export function getObjectTypeEnumItem(val: string | null) {
    return `TILED_OBJECT_TYPE_${(val ?? 'none').replace(/([a-z])([A-Z])/g,'$1_$2').toUpperCase()}`;
}
