import { useState } from "react";
import {
  useListMenuCategories,
  useCreateMenuCategory,
  useUpdateMenuCategory,
  useDeleteMenuCategory,
  useListMenuItems,
  useCreateMenuItem,
  useUpdateMenuItem,
  useDeleteMenuItem,
  getListMenuCategoriesQueryKey,
  getListMenuItemsQueryKey,
} from "@workspace/api-client-react";
import type {
  MenuCategory,
  MenuItem,
  CreateMenuCategoryBody,
  UpdateMenuCategoryBody,
  CreateMenuItemBody,
  UpdateMenuItemBody,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, X, Check, Loader2,
  ChevronRight, Tag, UtensilsCrossed, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

// ─── Category Form ─────────────────────────────────────────────────────────────
function CategoryForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: MenuCategory;
  onSave: (data: CreateMenuCategoryBody | UpdateMenuCategoryBody) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [nameMyanmar, setNameMyanmar] = useState(initial?.nameMyanmar ?? "");
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));

  const valid = name.trim() && nameMyanmar.trim();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Name (English)</Label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Tea & Coffee"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label>Name (Myanmar)</Label>
          <Input
            value={nameMyanmar}
            onChange={e => setNameMyanmar(e.target.value)}
            placeholder="e.g. လက်ဖက်ရည်"
          />
        </div>
      </div>
      <div className="space-y-1.5 w-32">
        <Label>Sort Order</Label>
        <Input
          type="number"
          value={sortOrder}
          onChange={e => setSortOrder(e.target.value)}
          min={0}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button
          disabled={!valid || saving}
          onClick={() => onSave({ name: name.trim(), nameMyanmar: nameMyanmar.trim(), sortOrder: parseInt(sortOrder) || 0 })}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
          {initial ? "Save Changes" : "Add Category"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Menu Item Form ────────────────────────────────────────────────────────────
function ItemForm({
  initial,
  categories,
  defaultCategoryId,
  onSave,
  onCancel,
  saving,
}: {
  initial?: MenuItem;
  categories: MenuCategory[];
  defaultCategoryId?: number;
  onSave: (data: CreateMenuItemBody | UpdateMenuItemBody) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [nameMyanmar, setNameMyanmar] = useState(initial?.nameMyanmar ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(initial?.price ?? "");
  const [categoryId, setCategoryId] = useState(String(initial?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? ""));
  const [available, setAvailable] = useState(initial ? initial.available !== "false" && initial.available !== "0" : true);
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));

  const valid = name.trim() && nameMyanmar.trim() && price.trim() && categoryId;

  const handleSave = () => {
    onSave({
      name: name.trim(),
      nameMyanmar: nameMyanmar.trim(),
      description: description.trim() || undefined,
      price: price.trim(),
      categoryId: parseInt(categoryId),
      available: available ? "true" : "false",
      imageUrl: imageUrl.trim() || undefined,
      sortOrder: parseInt(sortOrder) || 0,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Name (English)</Label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Milk Tea"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label>Name (Myanmar)</Label>
          <Input
            value={nameMyanmar}
            onChange={e => setNameMyanmar(e.target.value)}
            placeholder="e.g. နို့လက်ဖက်ရည်"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name} ({c.nameMyanmar})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Price (MMK)</Label>
          <Input
            type="number"
            value={price}
            onChange={e => setPrice(e.target.value)}
            placeholder="e.g. 800"
            min={0}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Description (optional)</Label>
        <Textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Short description..."
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Image URL (optional)</Label>
          <Input
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div className="space-y-1.5 w-32">
          <Label>Sort Order</Label>
          <Input
            type="number"
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value)}
            min={0}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 bg-muted/40 px-4 py-3 rounded-lg">
        <Switch
          id="available"
          checked={available}
          onCheckedChange={setAvailable}
        />
        <Label htmlFor="available" className="cursor-pointer">
          {available ? "Available (showing on menu)" : "Unavailable (hidden from menu)"}
        </Label>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button disabled={!valid || saving} onClick={handleSave}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
          {initial ? "Save Changes" : "Add Item"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Main Menu Page ────────────────────────────────────────────────────────────
export default function MenuPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  // Data
  const { data: categories = [], isLoading: catsLoading } = useListMenuCategories({ query: { queryKey: getListMenuCategoriesQueryKey() } });
  const [activeCatId, setActiveCatId] = useState<number | null>(null);
  const resolvedCatId = activeCatId ?? categories[0]?.id ?? null;

  const { data: allItems = [], isLoading: itemsLoading } = useListMenuItems(
    resolvedCatId != null ? { categoryId: resolvedCatId } : undefined,
    { query: { queryKey: getListMenuItemsQueryKey(resolvedCatId != null ? { categoryId: resolvedCatId } : undefined) } }
  );

  // Mutations – categories
  const createCat = useCreateMenuCategory();
  const updateCat = useUpdateMenuCategory();
  const deleteCat = useDeleteMenuCategory();

  // Mutations – items
  const createItem = useCreateMenuItem();
  const updateItem = useUpdateMenuItem();
  const deleteItem = useDeleteMenuItem();

  // Dialog state
  const [catDialog, setCatDialog] = useState<{ open: boolean; edit?: MenuCategory }>({ open: false });
  const [itemDialog, setItemDialog] = useState<{ open: boolean; edit?: MenuItem }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<{ type: "cat" | "item"; id: number; name: string } | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListMenuCategoriesQueryKey() });
    if (resolvedCatId != null) {
      qc.invalidateQueries({ queryKey: getListMenuItemsQueryKey({ categoryId: resolvedCatId }) });
    }
  };

  // ── Category handlers ──
  const handleSaveCat = async (data: CreateMenuCategoryBody | UpdateMenuCategoryBody) => {
    try {
      if (catDialog.edit) {
        await updateCat.mutateAsync({ id: catDialog.edit.id, data: data as UpdateMenuCategoryBody });
        toast({ title: "Category updated" });
      } else {
        const cat = await createCat.mutateAsync({ data: data as CreateMenuCategoryBody });
        setActiveCatId(cat.id);
        toast({ title: "Category created" });
      }
      setCatDialog({ open: false });
      invalidate();
    } catch {
      toast({ title: "Failed to save category", variant: "destructive" });
    }
  };

  const handleDeleteCat = async () => {
    if (!deleteTarget || deleteTarget.type !== "cat") return;
    try {
      await deleteCat.mutateAsync({ id: deleteTarget.id });
      if (activeCatId === deleteTarget.id) setActiveCatId(null);
      toast({ title: "Category deleted" });
      invalidate();
    } catch {
      toast({ title: "Failed to delete category", variant: "destructive" });
    }
    setDeleteTarget(null);
  };

  // ── Item handlers ──
  const handleSaveItem = async (data: CreateMenuItemBody | UpdateMenuItemBody) => {
    try {
      if (itemDialog.edit) {
        await updateItem.mutateAsync({ id: itemDialog.edit.id, data: data as UpdateMenuItemBody });
        toast({ title: "Menu item updated" });
      } else {
        await createItem.mutateAsync({ data: data as CreateMenuItemBody });
        toast({ title: "Menu item added" });
      }
      setItemDialog({ open: false });
      invalidate();
    } catch {
      toast({ title: "Failed to save item", variant: "destructive" });
    }
  };

  const handleToggleAvailable = async (item: MenuItem) => {
    const newVal = item.available === "false" || item.available === "0" ? "true" : "false";
    try {
      await updateItem.mutateAsync({ id: item.id, data: { available: newVal } });
      toast({ title: `${item.name} marked ${newVal === "true" ? "available" : "unavailable"}` });
      invalidate();
    } catch {
      toast({ title: "Failed to update availability", variant: "destructive" });
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteTarget || deleteTarget.type !== "item") return;
    try {
      await deleteItem.mutateAsync({ id: deleteTarget.id });
      toast({ title: "Item deleted" });
      invalidate();
    } catch {
      toast({ title: "Failed to delete item", variant: "destructive" });
    }
    setDeleteTarget(null);
  };

  if (catsLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Menu Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {categories.length} categories · {allItems.length} items in selected category
          </p>
        </div>
        <Button onClick={() => setItemDialog({ open: true })} disabled={categories.length === 0}>
          <Plus className="w-4 h-4 mr-2" /> Add Item
        </Button>
      </div>

      <div className="flex-1 flex gap-5 min-h-0">
        {/* ── Left: Category list ── */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Categories</span>
            <button
              className="text-primary hover:text-primary/80 p-1 rounded transition-colors"
              onClick={() => setCatDialog({ open: true })}
              title="Add category"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1">
            {categories.map(cat => {
              const active = (resolvedCatId === cat.id);
              return (
                <div
                  key={cat.id}
                  className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-foreground"
                  }`}
                  onClick={() => setActiveCatId(cat.id)}
                >
                  <Tag className={`w-4 h-4 flex-shrink-0 ${active ? "opacity-80" : "text-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{cat.name}</p>
                    <p className={`text-xs truncate ${active ? "opacity-70" : "text-muted-foreground"}`}>{cat.nameMyanmar}</p>
                  </div>
                  {active && (
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="p-1 rounded hover:bg-primary-foreground/20"
                        onClick={e => { e.stopPropagation(); setCatDialog({ open: true, edit: cat }); }}
                        title="Edit"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        className="p-1 rounded hover:bg-primary-foreground/20"
                        onClick={e => { e.stopPropagation(); setDeleteTarget({ type: "cat", id: cat.id, name: cat.name }); }}
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {!active && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />}
                </div>
              );
            })}

            {categories.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No categories yet</p>
                <button
                  className="text-primary text-xs mt-1 hover:underline"
                  onClick={() => setCatDialog({ open: true })}
                >
                  Add first category
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Items grid ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {resolvedCatId == null ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <UtensilsCrossed className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Select a category to see items</p>
              </div>
            </div>
          ) : itemsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Category header */}
              {categories.find(c => c.id === resolvedCatId) && (
                <div className="flex items-center justify-between mb-4 flex-shrink-0">
                  <div>
                    <h2 className="text-lg font-bold">
                      {categories.find(c => c.id === resolvedCatId)?.name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {categories.find(c => c.id === resolvedCatId)?.nameMyanmar} · {allItems.length} items
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setItemDialog({ open: true })}
                  >
                    <Plus className="w-4 h-4 mr-1" /> Add Item
                  </Button>
                </div>
              )}

              {allItems.length === 0 ? (
                <div className="flex-1 flex items-center justify-center border-2 border-dashed rounded-xl">
                  <div className="text-center text-muted-foreground">
                    <UtensilsCrossed className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="font-medium">No items in this category</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2"
                      onClick={() => setItemDialog({ open: true })}
                    >
                      <Plus className="w-4 h-4 mr-1" /> Add first item
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                    {allItems.map(item => {
                      const isAvail = item.available !== "false" && item.available !== "0";
                      return (
                        <div
                          key={item.id}
                          className={`group relative bg-card border rounded-xl p-4 flex flex-col gap-2 transition-all hover:shadow-md ${
                            !isAvail ? "opacity-60" : ""
                          }`}
                        >
                          {/* Availability badge */}
                          <Badge
                            variant="outline"
                            className={`absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 ${
                              isAvail
                                ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                                : "border-slate-300 text-slate-500 bg-slate-50"
                            }`}
                          >
                            {isAvail ? "Available" : "Unavailable"}
                          </Badge>

                          {/* Image */}
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-28 object-cover rounded-lg bg-muted"
                              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <div className="w-full h-24 bg-muted rounded-lg flex items-center justify-center">
                              <UtensilsCrossed className="w-8 h-8 text-muted-foreground/30" />
                            </div>
                          )}

                          {/* Info */}
                          <div className="flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-bold text-sm leading-snug">{item.name}</p>
                                <p className="text-xs text-muted-foreground">{item.nameMyanmar}</p>
                              </div>
                              <p className="text-base font-black text-primary whitespace-nowrap">
                                {Number(item.price).toLocaleString()} ks
                              </p>
                            </div>
                            {item.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center justify-between border-t pt-2 mt-1 gap-2">
                            <button
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => handleToggleAvailable(item)}
                              title="Toggle availability"
                            >
                              {isAvail
                                ? <Eye className="w-3.5 h-3.5" />
                                : <EyeOff className="w-3.5 h-3.5" />
                              }
                              {isAvail ? "Hide" : "Show"}
                            </button>
                            <div className="flex gap-1">
                              <button
                                className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                onClick={() => setItemDialog({ open: true, edit: item })}
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                className="p-1.5 rounded hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-600"
                                onClick={() => setDeleteTarget({ type: "item", id: item.id, name: item.name })}
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Category Dialog ── */}
      <Dialog open={catDialog.open} onOpenChange={open => setCatDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" />
              {catDialog.edit ? "Edit Category" : "Add Category"}
            </DialogTitle>
          </DialogHeader>
          <CategoryForm
            initial={catDialog.edit}
            onSave={handleSaveCat}
            onCancel={() => setCatDialog({ open: false })}
            saving={createCat.isPending || updateCat.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* ── Item Dialog ── */}
      <Dialog open={itemDialog.open} onOpenChange={open => setItemDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-primary" />
              {itemDialog.edit ? "Edit Menu Item" : "Add Menu Item"}
            </DialogTitle>
          </DialogHeader>
          <ItemForm
            initial={itemDialog.edit}
            categories={categories}
            defaultCategoryId={resolvedCatId ?? undefined}
            onSave={handleSaveItem}
            onCancel={() => setItemDialog({ open: false })}
            saving={createItem.isPending || updateItem.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.type === "cat" ? "Category" : "Item"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>"{deleteTarget?.name}"</strong> ကို ဖျက်မည်။
              {deleteTarget?.type === "cat" && " ဒီ Category ထဲက Items တွေပါ ဖျက်သွားမည်။"}
              {" "}ဒီလုပ်ဆောင်ချက်ကို ပြန်လည်မပြောင်းနိုင်ပါ။
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={deleteTarget?.type === "cat" ? handleDeleteCat : handleDeleteItem}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
