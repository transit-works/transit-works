// https://gist.github.com/rosszurowski/67f04465c424a9bc0dae
export default function lerpColor(a, b, amount) {
    const ah = parseInt(a.replace(/#/g, ''), 16);
    const ar = ah >> 16;
    const ag = (ah >> 8) & 0xff;
    const ab = ah & 0xff;
    const bh = parseInt(b.replace(/#/g, ''), 16);
    const br = bh >> 16;
    const bg = (bh >> 8) & 0xff;
    const bb = bh & 0xff;
    const rr = ar + amount * (br - ar);
    const rg = ag + amount * (bg - ag);
    const rb = ab + amount * (bb - ab);

    return [rr, rg, rb];
}
