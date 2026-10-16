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

describe("SectionToc variant='dropdown'", () => {
  const open = () => fireEvent.mouseDown(screen.getByRole('combobox'));

  it('is a select inside the same named landmark, showing the active section', () => {
    render(<SectionToc variant="dropdown" sections={sections} active="Dim." onSelect={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(nav).toContainElement(screen.getByRole('combobox'));
    expect(screen.getByRole('combobox')).toHaveTextContent('Dim.');
  });

  it('offers the sections in order', () => {
    render(<SectionToc variant="dropdown" sections={sections} active="Edit" onSelect={() => {}} />);
    open();
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(sections);
  });

  it('reports the picked section and changes nothing itself', () => {
    const onSelect = vi.fn();
    render(<SectionToc variant="dropdown" sections={sections} active="Edit" onSelect={onSelect} />);
    open();
    fireEvent.click(screen.getByRole('option', { name: 'Cargo' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('Cargo');
    expect(screen.getByRole('combobox')).toHaveTextContent('Edit');
  });

  it('reports a pick of the active section too, as the list does', () => {
    const onSelect = vi.fn();
    render(<SectionToc variant="dropdown" sections={sections} active="Dim." onSelect={onSelect} />);
    open();
    fireEvent.click(screen.getByRole('option', { name: 'Dim.' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('Dim.');
  });

  it('shows nothing for an active section it does not list', () => {
    render(<SectionToc variant="dropdown" sections={sections} active="Gone" onSelect={() => {}} />);
    expect(screen.getByRole('combobox')).not.toHaveTextContent(/\w/);
  });

  it('renders nothing without sections', () => {
    const { container } = render(<SectionToc variant="dropdown" sections={[]} onSelect={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SectionToc loading', () => {
  it('keeps one placeholder per section, as large as its label, and offers nothing to pick', () => {
    const onSelect = vi.fn();
    render(<SectionToc sections={sections} onSelect={onSelect} loading />);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(nav).toHaveAttribute('aria-busy', 'true');
    // The skeleton wraps the label itself, so it takes the label's size.
    const bones = [...nav.querySelectorAll('.MuiSkeleton-root')];
    expect(bones.map(b => b.textContent)).toEqual(sections);
    expect(screen.queryAllByRole('button')).toEqual([]);
    fireEvent.click(bones[1]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('draws the dropdown as a skeleton of the field', () => {
    render(<SectionToc sections={sections} onSelect={() => {}} variant="dropdown" loading />);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(nav.querySelector('.MuiSkeleton-root .MuiTextField-root')).not.toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('still renders nothing without sections', () => {
    const { container } = render(<SectionToc sections={[]} onSelect={() => {}} loading />);
    expect(container).toBeEmptyDOMElement();
  });
});
