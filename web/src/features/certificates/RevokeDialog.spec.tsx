import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../../api/errors'
import { RevokeDialog, type RevokeDialogProps } from './RevokeDialog'

function renderDialog(props: Partial<RevokeDialogProps> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <RevokeDialog
      serial="SYD-2026-000001"
      pending={false}
      error={null}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  )
  return { onConfirm, onCancel }
}

describe('RevokeDialog', () => {
  it('is a labelled modal dialog with the reason field focused', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog', { name: 'Revoke SYD-2026-000001?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByLabelText('Reason (optional)')).toHaveFocus()
  })

  it('confirms with the trimmed reason', async () => {
    const { onConfirm } = renderDialog()
    await userEvent.type(screen.getByLabelText('Reason (optional)'), '  Issued in error  ')
    await userEvent.click(screen.getByRole('button', { name: 'Revoke certificate' }))
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith('Issued in error')
  })

  it('confirms with no reason when the field is blank', async () => {
    const { onConfirm } = renderDialog()
    await userEvent.type(screen.getByLabelText('Reason (optional)'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Revoke certificate' }))
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(undefined)
  })

  it('limits the reason to the contract’s maximum', () => {
    renderDialog()
    expect(screen.getByLabelText('Reason (optional)')).toHaveAttribute('maxLength', '500')
  })

  it('cancels with the button or Escape', async () => {
    const { onCancel, onConfirm } = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('disables everything and ignores Escape and Enter while pending', async () => {
    const { onCancel, onConfirm } = renderDialog({ pending: true })
    expect(screen.getByRole('button', { name: 'Revoking…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByLabelText('Reason (optional)')).toBeDisabled()
    screen.getByRole('dialog').focus()
    await userEvent.keyboard('{Escape}{Enter}')
    expect(onCancel).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('shows a failure inside the dialog', () => {
    renderDialog({ error: new ApiError(500, 'internal_error', 'Database unavailable') })
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t revoke: Database unavailable')
    expect(screen.getByRole('button', { name: 'Revoke certificate' })).toBeEnabled()
  })
})
