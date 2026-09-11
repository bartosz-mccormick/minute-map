const MOBILE_DRAW_SCROLL_LOCK_QUERY = "(max-width: 700px), (pointer: coarse)"

export function shouldLockMobileDrawScroll(
  win: Pick<Window, "innerWidth" | "matchMedia"> = window
) {
  return win.matchMedia?.(MOBILE_DRAW_SCROLL_LOCK_QUERY).matches ?? win.innerWidth <= 700
}

export function lockMobileDrawScroll(doc: Document = document) {
  const { documentElement, body } = doc
  const previous = {
    documentOverflow: documentElement.style.overflow,
    documentOverscrollBehavior: documentElement.style.overscrollBehavior,
    documentTouchAction: documentElement.style.touchAction,
    bodyOverflow: body.style.overflow,
    bodyOverscrollBehavior: body.style.overscrollBehavior,
    bodyTouchAction: body.style.touchAction,
  }
  const preventTouchScroll = (event: TouchEvent) => {
    event.preventDefault()
  }

  documentElement.style.overflow = "hidden"
  documentElement.style.overscrollBehavior = "none"
  documentElement.style.touchAction = "none"
  body.style.overflow = "hidden"
  body.style.overscrollBehavior = "none"
  body.style.touchAction = "none"
  doc.addEventListener("touchmove", preventTouchScroll, { passive: false })

  return () => {
    documentElement.style.overflow = previous.documentOverflow
    documentElement.style.overscrollBehavior = previous.documentOverscrollBehavior
    documentElement.style.touchAction = previous.documentTouchAction
    body.style.overflow = previous.bodyOverflow
    body.style.overscrollBehavior = previous.bodyOverscrollBehavior
    body.style.touchAction = previous.bodyTouchAction
    doc.removeEventListener("touchmove", preventTouchScroll)
  }
}
