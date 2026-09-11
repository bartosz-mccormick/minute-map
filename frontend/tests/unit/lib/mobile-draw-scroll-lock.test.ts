import { afterEach, describe, expect, it, vi } from "vitest"
import {
  lockMobileDrawScroll,
  shouldLockMobileDrawScroll,
} from "@/lib/mobile-draw-scroll-lock"

describe("shouldLockMobileDrawScroll", () => {
  it("locks scrolling for coarse pointer devices", () => {
    const win = {
      innerWidth: 1200,
      matchMedia: vi.fn(() => ({ matches: true })),
    } as unknown as Pick<Window, "innerWidth" | "matchMedia">

    expect(shouldLockMobileDrawScroll(win)).toBe(true)
  })

  it("falls back to mobile width when matchMedia is unavailable", () => {
    const win = {
      innerWidth: 700,
      matchMedia: undefined,
    } as unknown as Pick<Window, "innerWidth" | "matchMedia">

    expect(shouldLockMobileDrawScroll(win)).toBe(true)
  })

  it("does not lock desktop fine-pointer scrolling", () => {
    const win = {
      innerWidth: 1200,
      matchMedia: vi.fn(() => ({ matches: false })),
    } as unknown as Pick<Window, "innerWidth" | "matchMedia">

    expect(shouldLockMobileDrawScroll(win)).toBe(false)
  })
})

describe("lockMobileDrawScroll", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("style")
    document.body.removeAttribute("style")
  })

  it("prevents touch scrolling until cleanup restores previous styles", () => {
    document.documentElement.style.overflow = "auto"
    document.documentElement.style.overscrollBehavior = "contain"
    document.documentElement.style.touchAction = "pan-y"
    document.body.style.overflow = "auto"
    document.body.style.overscrollBehavior = "contain"
    document.body.style.touchAction = "pan-y"

    const cleanup = lockMobileDrawScroll()

    expect(document.documentElement.style.overflow).toBe("hidden")
    expect(document.documentElement.style.overscrollBehavior).toBe("none")
    expect(document.documentElement.style.touchAction).toBe("none")
    expect(document.body.style.overflow).toBe("hidden")
    expect(document.body.style.overscrollBehavior).toBe("none")
    expect(document.body.style.touchAction).toBe("none")

    const lockedEvent = new Event("touchmove", { cancelable: true })
    document.dispatchEvent(lockedEvent)

    expect(lockedEvent.defaultPrevented).toBe(true)

    cleanup()

    expect(document.documentElement.style.overflow).toBe("auto")
    expect(document.documentElement.style.overscrollBehavior).toBe("contain")
    expect(document.documentElement.style.touchAction).toBe("pan-y")
    expect(document.body.style.overflow).toBe("auto")
    expect(document.body.style.overscrollBehavior).toBe("contain")
    expect(document.body.style.touchAction).toBe("pan-y")

    const restoredEvent = new Event("touchmove", { cancelable: true })
    document.dispatchEvent(restoredEvent)

    expect(restoredEvent.defaultPrevented).toBe(false)
  })
})
