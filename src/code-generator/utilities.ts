const hasExplicitFractionalPart = /\.[0-9]+$/;

// 1.0e100 or 1.0E100
// 1e20 or 1E20
// -1e20 or 1E20
const isScientificNotation = /^-?[0-9]+(\.[0-9])?(e|E)-?[0-9]+$/;

export function jsNumberToCFloat(val: string) {
    if(isScientificNotation.test(val)) {
        val = `${val}`;
    } else if(!hasExplicitFractionalPart.test(val)) {
        val = `${val}.0`;
    }
    return `${val}f`;
}
