import { css } from '@linaria/core'
import type { FC } from 'react'
import { useMemo } from 'react'
import manualRaw from '../../../MANUAL.md?raw'

const manualClass = css`
    padding: 28px 32px;
    max-width: 760px;
    width: 100%;
    color: inherit;
    font-family: "Kode", monospace;
    font-size: 16px;
    line-height: 1.75;
    text-align: left;
    overflow-y: auto;
    max-height: 82vh;

    h1 {
        font-size: 26px;
        margin-bottom: 18px;
        border-bottom: 1px solid currentColor;
        padding-bottom: 10px;
        text-align: left;
    }

    h2 {
        font-size: 20px;
        margin-top: 28px;
        margin-bottom: 12px;
        text-align: left;
    }

    h3 {
        font-size: 17px;
        margin-top: 18px;
        margin-bottom: 8px;
        text-align: left;
    }

    p {
        margin-bottom: 14px;
        text-align: left;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 18px;
        text-align: left;
    }

    th,
    td {
        text-align: left;
        padding: 8px 14px;
        border: 1px solid rgba(128, 128, 128, 0.3);
    }

    th {
        background: rgba(128, 128, 128, 0.1);
        font-weight: 600;
    }

    code {
        background: rgba(128, 128, 128, 0.15);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: "Kode", monospace;
    }

    ul,
    ol {
        margin-bottom: 14px;
        padding-left: 28px;
        text-align: left;
    }

    li {
        margin-bottom: 6px;
        text-align: left;
    }

    a {
        color: inherit;
        text-decoration: underline;
    }

    a:hover {
        opacity: 0.8;
    }

    img {
        display: block;
        width: 100%;
        height: auto;
        border: 1px solid rgba(128, 128, 128, 0.3);
        margin: 10px 0;
        background: rgba(0, 0, 0, 0.25);
    }

    strong {
        font-weight: 600;
    }

    hr {
        border: none;
        border-top: 1px solid rgba(128, 128, 128, 0.3);
        margin: 16px 0;
    }
`

interface MarkdownNode {
    key: string
    type: 'h1' | 'h2' | 'h3' | 'p' | 'ul' | 'ol' | 'table' | 'hr'
    content?: string
    children?: MarkdownNode[]
    rows?: string[][]
}

const withOccurrence = (counts: Map<string, number>, base: string): string => {
    const occurrence = counts.get(base) ?? 0
    counts.set(base, occurrence + 1)
    return occurrence === 0 ? base : `${base}:${occurrence}`
}

// Parse inline markdown elements (code, bold, links)
const parseInline = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = []
    let remaining = text
    let key = 0

    while (remaining.length > 0) {
        // Inline image
        const imageMatch = remaining.match(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]+)")?\)/)
        if (imageMatch && imageMatch.index !== undefined) {
            if (imageMatch.index > 0) {
                parts.push(parseInline(remaining.slice(0, imageMatch.index)))
            }
            parts.push(
                <img
                    key={`img-${key++}`}
                    src={imageMatch[2]}
                    alt={imageMatch[1]}
                    title={imageMatch[3]}
                    loading="lazy"
                />,
            )
            remaining = remaining.slice(imageMatch.index + imageMatch[0].length)
            continue
        }

        // Inline code
        const codeMatch = remaining.match(/`([^`]+)`/)
        if (codeMatch && codeMatch.index !== undefined) {
            if (codeMatch.index > 0) {
                parts.push(parseInline(remaining.slice(0, codeMatch.index)))
            }
            parts.push(<code key={`code-${key++}`}>{codeMatch[1]}</code>)
            remaining = remaining.slice(codeMatch.index + codeMatch[0].length)
            continue
        }

        // Bold
        const boldMatch = remaining.match(/\*\*([^*]+)\*\*/)
        if (boldMatch && boldMatch.index !== undefined) {
            if (boldMatch.index > 0) {
                parts.push(parseInline(remaining.slice(0, boldMatch.index)))
            }
            parts.push(<strong key={`bold-${key++}`}>{boldMatch[1]}</strong>)
            remaining = remaining.slice(boldMatch.index + boldMatch[0].length)
            continue
        }

        // Links
        const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/)
        if (linkMatch && linkMatch.index !== undefined) {
            if (linkMatch.index > 0) {
                parts.push(parseInline(remaining.slice(0, linkMatch.index)))
            }
            parts.push(
                <a key={`link-${key++}`} href={linkMatch[2]} target="_blank" rel="noopener noreferrer">
                    {linkMatch[1]}
                </a>
            )
            remaining = remaining.slice(linkMatch.index + linkMatch[0].length)
            continue
        }

        // No more matches, append remaining text
        parts.push(remaining)
        break
    }

    return parts.length === 1 ? parts[0] : parts
}

function parseMarkdown(md: string): MarkdownNode[] {
    const lines = md.split('\n')
    const nodes: MarkdownNode[] = []
    const nodeKeyCounts = new Map<string, number>()
    const nodeKey = (base: string): string => withOccurrence(nodeKeyCounts, base)
    let i = 0

    const parseTable = (startIdx: number): { node: MarkdownNode; endIdx: number } => {
        const rows: string[][] = []
        let j = startIdx

        while (j < lines.length && lines[j].trim().startsWith('|')) {
            const cells = lines[j]
                .trim()
                .split('|')
                .map((cell) => cell.trim())
                .filter((cell) => cell !== '')

            // Skip separator rows (like | --- | --- |)
            if (!cells.every((cell) => /^[-:]+$/.test(cell))) {
                rows.push(cells)
            }
            j++
        }

        return {
            node: { key: nodeKey(`table:${rows.map((row) => row.join('|')).join('||')}`), type: 'table', rows },
            endIdx: j - 1,
        }
    }

    while (i < lines.length) {
        const line = lines[i].trim()

        // Empty lines
        if (line === '') {
            i++
            continue
        }

        // Horizontal rule
        if (line === '---') {
            nodes.push({ key: nodeKey('hr'), type: 'hr' })
            i++
            continue
        }

        // Headers
        if (line.startsWith('# ')) {
            nodes.push({ key: nodeKey(`h1:${line.slice(2)}`), type: 'h1', content: line.slice(2) })
            i++
            continue
        }
        if (line.startsWith('## ')) {
            nodes.push({ key: nodeKey(`h2:${line.slice(3)}`), type: 'h2', content: line.slice(3) })
            i++
            continue
        }
        if (line.startsWith('### ')) {
            nodes.push({ key: nodeKey(`h3:${line.slice(4)}`), type: 'h3', content: line.slice(4) })
            i++
            continue
        }

        // Unordered list
        if (line.startsWith('- ')) {
            const items: string[] = []
            while (i < lines.length && lines[i].trim().startsWith('- ')) {
                items.push(lines[i].trim().slice(2))
                i++
            }
            const listItemKeyCounts = new Map<string, number>()
            nodes.push({
                key: nodeKey(`ul:${items.join('|')}`),
                type: 'ul',
                children: items.map((item) => ({
                    key: withOccurrence(listItemKeyCounts, `li:${item}`),
                    type: 'p' as const,
                    content: item,
                })),
            })
            continue
        }

        // Ordered list
        const olMatch = line.match(/^(\d+)\.\s/)
        if (olMatch) {
            const items: string[] = []
            while (i < lines.length && lines[i].trim().match(/^\d+\.\s/)) {
                items.push(lines[i].trim().replace(/^\d+\.\s/, ''))
                i++
            }
            const listItemKeyCounts = new Map<string, number>()
            nodes.push({
                key: nodeKey(`ol:${items.join('|')}`),
                type: 'ol',
                children: items.map((item) => ({
                    key: withOccurrence(listItemKeyCounts, `li:${item}`),
                    type: 'p' as const,
                    content: item,
                })),
            })
            continue
        }

        // Table
        if (line.startsWith('|')) {
            const { node, endIdx } = parseTable(i)
            nodes.push(node)
            i = endIdx + 1
            continue
        }

        // Paragraph
        nodes.push({ key: nodeKey(`p:${line}`), type: 'p', content: line })
        i++
    }

    return nodes
}

const renderNode = (node: MarkdownNode): React.ReactNode => {
    switch (node.type) {
        case 'h1':
            return <h1 key={node.key}>{node.content}</h1>
        case 'h2':
            return <h2 key={node.key}>{node.content}</h2>
        case 'h3':
            return <h3 key={node.key}>{node.content}</h3>
        case 'p':
            return <p key={node.key}>{node.content ? parseInline(node.content) : null}</p>
        case 'ul':
            return (
                <ul key={node.key}>
                    {node.children?.map((child) => (
                        <li key={child.key}>{child.content ? parseInline(child.content) : null}</li>
                    ))}
                </ul>
            )
        case 'ol':
            return (
                <ol key={node.key}>
                    {node.children?.map((child) => (
                        <li key={child.key}>{child.content ? parseInline(child.content) : null}</li>
                    ))}
                </ol>
            )
        case 'table': {
            const rowKeyCounts = new Map<string, number>()
            return (
                <table key={node.key}>
                    <thead>
                        <tr>
                            {node.rows?.[0]?.map((cell) => (
                                <th key={withOccurrence(rowKeyCounts, `th:${cell}`)}>{parseInline(cell)}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {node.rows?.slice(1)?.map((row) => (
                            <tr key={withOccurrence(rowKeyCounts, `tr:${row.join('|')}`)}>
                                {row.map((cell) => (
                                    <td key={withOccurrence(rowKeyCounts, `td:${row.join('|')}:${cell}`)}>
                                        {parseInline(cell)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )
        }
        case 'hr':
            return <hr key={node.key} />
        default:
            return null
    }
}

export const Manual: FC = () => {
    const nodes = useMemo(() => parseMarkdown(manualRaw), [])

    return <div className={manualClass}>{nodes.map((node) => renderNode(node))}</div>
}
