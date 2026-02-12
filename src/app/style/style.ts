import { css } from '@linaria/core'
import { colors, colorTheme } from './colors'
import { fontName } from './fonts'
import { fragments } from './fragments'
import { themeColors } from './themeColors'
import { notCss } from './util'
import './font.css'
import './prescreen.css'

export const style = notCss({
  colors,
  themeColors,
})

export const globalStyle = css`
  :global() {
    :root {
      ${colorTheme}

      color-scheme: light dark;
      color: ${style.themeColors.text.default};
      background-color: ${style.themeColors.background.default};

      font-synthesis: none;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;

      interpolate-size: allow-keywords;
      cursor: default;
      user-select: none;
    }

    *:focus {
      outline: none;
    }

    body {
      font-family: "${fontName}";
      ${fragments.textStyle.body.m.regular};
      line-height: normal;
      margin: 0;
      display: flex;
      place-items: center;
      min-width: 320px;
      min-height: 100%;
    }

    a {
      color: ${style.themeColors.text.link};
      transition: ${fragments.transition.fast('color')};
      &:hover {
        color: ${style.colors.aqua[500]};
      }

      &:visited {
        color: ${style.colors.aqua[600]};
        &:hover {
          color: ${style.colors.aqua[700]};
        }
      }
    }

    h1 {
      ${fragments.textStyle.heading.xxl}
    }
    h2 {
      ${fragments.textStyle.heading.xl};
    }
    h3 {
      ${fragments.textStyle.heading.l};
    }
    h4 {
      ${fragments.textStyle.heading.m};
    }

    code {
      white-space: nowrap;
      border: 1px solid ${style.themeColors.line.default};
      padding: 0 4px;
      color: ${style.themeColors.text.important};
      background-color: ${style.themeColors.background.default};

    }

    #root {
      flex: 1;
      display: flex;
      flex-direction: row;
      justify-content: space-evenly;
      align-items: stretch;      
      min-height: 100%;
      max-height: 100%;
      gap: 16px;
    }

    .M8-full-view {
      max-height:88vh !important;
    }

  }
`
