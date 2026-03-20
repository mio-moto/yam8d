import { fontSizeValues, fontWeightValues } from './texts'
import { notCss } from './util'

/* Body S */
const bodySRegular = `
font-size: ${fontSizeValues.s};
line-height: 100%;
letter-spacing: normal; 
font-weight: ${fontWeightValues.regular};
font-stretch: normal;
` as const
const bodySCondensed = `
font-size: ${fontSizeValues.s};
line-height: 100%;
letter-spacing: .42px;
font-weight: ${fontWeightValues.regular};
font-stretch: condensed;
` as const

/* Body M */
const bodyMRegular = `
font-size: ${fontSizeValues.m};
line-height: 100%;
letter-spacing: normal; 
font-weight: ${fontWeightValues.regular};
font-stretch: normal;
` as const
const bodyMCondensed = `
font-size: ${fontSizeValues.m};
line-height: 100%;
letter-spacing: .3px;
font-weight: ${fontWeightValues.regular};
font-stretch: condensed;
` as const

/* Body L */
const bodyLRegular = `
font-size: ${fontSizeValues.l};
line-height: 100%;
letter-spacing: normal; 
font-weight: ${fontWeightValues.regular};
font-stretch: normal;
` as const
const bodyLCondensed = `
font-size: ${fontSizeValues.l};
line-height: 100%;
letter-spacing: .6px;
font-weight: ${fontWeightValues.regular};
font-stretch: condensed;
` as const

export const bodyFragments = notCss({
    s: notCss({
        regular: bodySRegular,
        condensed: bodySCondensed,
    } as const),
    m: notCss({
        regular: bodyMRegular,
        condensed: bodyMCondensed,
    } as const),
    l: notCss({
        regular: bodyLRegular,
        condensed: bodyLCondensed,
    }),
} as const)

export const headingFragments = notCss({
    m: `
font-size: ${fontSizeValues.m};
line-height: 100%;
letter-spacing: normal;
font-weight: ${fontWeightValues.regular};
font-stretch: condensed;` as const,
    l: `
font-size: ${fontSizeValues.l};
line-height: 100%;
letter-spacing: normal;
font-weight: ${fontWeightValues.regular};
font-stretch: condensed;` as const,
    xl: `
font-size: ${fontSizeValues.xl};
line-height: 100%;
letter-spacing: normal;
font-weight: ${fontWeightValues.regular};
font-stretch: condensed;` as const,
    xxl: `
font-size: ${fontSizeValues.xxl};
line-height: 100%;
letter-spacing: normal;
font-weight: ${fontWeightValues.regular};
font-stretch: condensed;` as const,
})

/* Button M/L */
const buttonMFragment = `
font-size: ${fontSizeValues.m};
line-height: 100%;
letter-spacing: normal;
font-weight: 700;
font-stretch: condensed;
`
const buttonLFragment = `
font-size: ${fontSizeValues.l};
line-height: 100%;
letter-spacing: normal;
font-weight: 700;
font-stretch: condensed;
`

export const buttonFragments = notCss({
    regular: buttonMFragment,
    l: buttonLFragment,
} as const)

export const textStyleFragments = notCss({
    body: bodyFragments,
    heading: headingFragments,
    button: buttonFragments,
})
