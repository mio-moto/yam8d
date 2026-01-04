export interface TargetList extends Array<EventTarget> { }

export type Action = EventListenerOrEventListenerObject;
export type EventName = string;

export function on(target: any, eventType: EventName, action: Action, useCapture?: boolean): void {
    if (typeof target === 'string') {
        target = document.querySelectorAll(target);
    } else if (!(target instanceof Array)) {
        target = [target];
    }
    for (const element of target) {
        element.addEventListener(eventType, action, useCapture);
    }
}
export function off(target: any, eventType: EventName, action: Action, useCapture?: boolean): void {
    if (typeof target === 'string') {
        target = document.querySelectorAll(target);
    } else if (!(target instanceof Array)) {
        target = [target];
    }
    for (const element of target) {
        element.removeEventListener(eventType, action, useCapture);
    }
}