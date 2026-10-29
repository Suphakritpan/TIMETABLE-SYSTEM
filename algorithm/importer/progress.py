"""Live progress of one reading: the demo dashboard shows it while a file is read. The app sets a listener, the
engine reports what it is doing (a stage, a page done, a format tried). No listener = nothing happens (command line,
tests). One reading at a time (the app queues them), so one listener is enough.
A listener may raise Cancelled (the person pressed cancel): the reading stops at its next report."""
_listener = None


class Cancelled(Exception):
    pass


_stop = None


def stop_when(fn):
    """fn() -> True once the person pressed cancel: running outside programs (OCR) are killed at once."""
    global _stop
    _stop = fn


def cancelled():
    return bool(_stop and _stop())


def listen(fn):
    global _listener
    _listener = fn


def report(event, **data):
    if _listener:
        _listener(event, data)
