import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderRoute } from '../test/render'

describe('app routes', () => {
  it('redirects / to /certificates', async () => {
    const { router } = renderRoute('/')
    expect(await screen.findByRole('heading', { name: 'Certificates' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/certificates')
  })

  it.each([
    ['/certificates', 'Certificates'],
    ['/certificates/42', 'Certificate'],
    ['/bulk-issue', 'Bulk issue'],
    ['/audit', 'Audit log'],
  ])('renders %s inside the layout', async (path, heading) => {
    renderRoute(path)
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
    expect(screen.getByText('Certificate Admin Console')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
  })

  it('shows a not-found page for unknown paths', async () => {
    renderRoute('/nope')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('navigates with the header links and marks the active one', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/certificates')
    const nav = await screen.findByRole('navigation', { name: 'Main' })

    await user.click(screen.getByRole('link', { name: 'Bulk issue' }))
    expect(router.state.location.pathname).toBe('/bulk-issue')
    expect(await screen.findByRole('heading', { name: 'Bulk issue' })).toBeInTheDocument()
    expect(nav.querySelector('a[aria-current="page"]')).toHaveTextContent('Bulk issue')

    await user.click(screen.getByRole('link', { name: 'Audit log' }))
    expect(router.state.location.pathname).toBe('/audit')
  })
})
