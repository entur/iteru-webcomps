import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SectionToc } from './index';

const sections = ['Edit', 'Dim.', 'Cargo'];

describe('SectionToc', () => {
  it('lists the sections in order inside a named landmark', () => {
    render(<SectionToc sections={sections} onSelect={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect([...nav.querySelectorAll('[role="button"]')].map(b => b.textContent)).toEqual(sections);
  });

  it('marks only the active section', () => {
    render(<SectionToc sections={sections} active="Dim." onSelect={() => {}} />);
    const current = screen.getAllByRole('button').filter(b => b.getAttribute('aria-current'));
    expect(current.map(b => b.textContent)).toEqual(['Dim.']);
    expect(current[0]).toHaveAttribute('aria-current', 'location');
    expect(current[0]).toHaveClass('Mui-selected');
  });

  it('marks nothing for an active section it does not list', () => {
    render(<SectionToc sections={sections} active="Gone" onSelect={() => {}} />);
    expect(document.querySelector('[aria-current]')).toBeNull();
  });

  it('reports the picked section and changes nothing itself', () => {
    const onSelect = vi.fn();
    render(<SectionToc sections={sections} active="Edit" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cargo' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('Cargo');
    // Stateless: the mark moves only when the host moves `active`.
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-current', 'location');
  });

  it('takes a localized landmark name', () => {
    render(<SectionToc sections={sections} label="Innhold" onSelect={() => {}} />);
    expect(screen.getByRole('navigation', { name: 'Innhold' })).toBeInTheDocument();
  });

  it('renders nothing without sections', () => {
    const { container } = render(<SectionToc sections={[]} onSelect={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
