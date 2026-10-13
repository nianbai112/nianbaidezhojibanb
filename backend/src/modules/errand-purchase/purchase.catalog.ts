// Shared by catalog, cart refresh and quote; disabling a parent hides all descendants.
export const availableCategory = {
  OR: [
    { categoryId: null },
    { catalogCategory: { enabled: true, OR: [{ parentId: null }, { parent: { enabled: true } }] } },
  ],
};

export function categoryIsAvailable(product: any): boolean {
  if (!product.categoryId) return true;
  const c = product.catalogCategory;
  return !!c?.enabled && (!c.parentId || !!c.parent?.enabled);
}

export function categoryTree(categories: any[]) {
  return categories.filter(c => !c.parentId && c.enabled).map(c => ({
    id: c.id, name: c.name,
    children: categories.filter(child => child.parentId === c.id && child.enabled)
      .map(child => ({ id: child.id, name: child.name })),
  }));
}
