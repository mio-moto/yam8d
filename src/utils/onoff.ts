export interface TargetList extends Array<EventTarget> {}

export type Action = EventListenerOrEventListenerObject
export type EventName = string

export function on(target: unknown, eventType: EventName, action: Action, useCapture?: boolean): void {
    if (typeof target === 'string') {
        target = document.querySelectorAll(target)
    } else if (!Array.isArray(target)) {
        target = [target]
    }
    for (const element of target as Array<HTMLElement>) {
        element.addEventListener(eventType, action, useCapture)
    }
}
export function off(target: unknown, eventType: EventName, action: Action, useCapture?: boolean): void {
    if (typeof target === 'string') {
        target = document.querySelectorAll(target)
    } else if (!Array.isArray(target)) {
        target = [target]
    }
    for (const element of target as Array<HTMLElement>) {
        element.removeEventListener(eventType, action, useCapture)
    }
}
