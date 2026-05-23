import { fireEvent, render, screen } from '@testing-library/react'

import MenuItemCard from '../MenuItemCard'
import type { MenuItem } from '@/types'

const mockItem: MenuItem = {
  item_id: 'item-1',
  category_id: 1,
  listed_by: undefined,
  name: 'Chicken Sandwich',
  description: 'Grilled chicken with fresh vegetables',
  price: 180,
  image_url: undefined,
  is_available: true,
  is_homemade: true,
  prep_time_mins: 15,
  created_at: '2026-05-23T00:00:00Z',
  category_name: 'Lunch',
}

describe('MenuItemCard', () => {
  it('renders item details and handles add to cart', () => {
    const onAddToCart = jest.fn()

    render(<MenuItemCard item={mockItem} onAddToCart={onAddToCart} />)

    expect(screen.getByText(mockItem.name)).toBeInTheDocument()
    expect(screen.getByText('BDT 180.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add to cart/i })).toBeInTheDocument()
    expect(screen.getByText('Homemade')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }))

    expect(onAddToCart).toHaveBeenCalledTimes(1)
    expect(onAddToCart).toHaveBeenCalledWith(mockItem)
  })
})