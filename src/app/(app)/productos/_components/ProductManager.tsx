"use client";

import { useState } from "react";
import { toast } from "sonner";

import { api } from "~/trpc/react";
import { parseZodError } from "~/lib/parseZodError";

import { ProductHistoryPanel } from "./ProductHistory";
import { ProductFormFields } from "./ProductFormFields";
import { ProductAdjustPanel, ProductEditPanel, ProductPricePanel } from "./ProductPanels";
import { ProductBadges, ProductRowActions, type RowMode } from "./ProductRow";
import {
  type AdjustForm,
  type BusinessTax,
  type EnabledTax,
  emptyAdjust,
  emptyForm,
  formatCOP,
  formatDate,
  makeChangeHandler,
  makeCheckHandler,
  makeExclusiveCheckHandler,
  makeSelectHandler,
  makeToggleTaxSlotHandler,
  type ProductForm,
  parseForm,
  toDateInput,
} from "./productForm";

export function ProductManager({ userRole }: Readonly<{ userRole: "OWNER" | "CASHIER" }>) {
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<ProductForm>(emptyForm);
  const [activeRow, setActiveRow] = useState<{ id: string; mode: RowMode } | null>(null);
  const [editForm, setEditForm] = useState<ProductForm>(emptyForm);
  const [adjustForm, setAdjustForm] = useState<AdjustForm>(emptyAdjust);
  const [priceForm, setPriceForm] = useState("");

  const { data: products, isPending: loadingList } = api.product.list.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  // El cajero solo ve "Precio" si el propietario habilitó el cambio de precios (el servidor lo valida igual)
  const { data: permissions } = api.product.permissions.useQuery(undefined, { staleTime: 60_000 });
  const canEditPrices = userRole === "OWNER" || (permissions?.canEditPrices ?? false);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredProducts = normalizedSearch
    ? products?.filter((p) => p.name.toLowerCase().includes(normalizedSearch))
    : products;

  const { data: settings } = api.business.getSettings.useQuery(undefined, {
    enabled: userRole === "OWNER",
    staleTime: 30_000,
  });
  const categories = settings?.categories ?? [];
  const brands = settings?.brands ?? [];
  const businessTaxes: EnabledTax[] = (
    (settings?.taxes as BusinessTax[] | undefined) ?? []
  )
    .map((t, slot) => ({ slot, name: t.name, rate: t.rate, enabled: t.enabled }))
    .filter((t) => t.enabled && t.rate > 0);

  const activeProduct = products?.find((p) => p.id === activeRow?.id);

  const movementsQuery = api.product.listMovements.useQuery(
    { productId: activeRow?.id ?? "" },
    { enabled: activeRow?.mode === "history" && !!activeRow.id && (activeProduct?.trackStock ?? true) },
  );

  const salesQuery = api.product.listProductSales.useQuery(
    { productId: activeRow?.id ?? "" },
    { enabled: activeRow?.mode === "history" && !!activeRow.id && activeProduct?.trackStock === false },
  );

  const createProduct = api.product.create.useMutation({
    onSuccess: async (data) => {
      toast.success(data.message);
      setCreateForm(emptyForm);
      setShowCreate(false);
      // Una marca nueva queda guardada en el negocio: se refresca para sugerirla en el siguiente.
      await Promise.all([utils.product.list.invalidate(), utils.business.getSettings.invalidate()]);
    },
  });

  const updateProduct = api.product.update.useMutation({
    onMutate: async (newData) => {
      await utils.product.list.cancel();
      const prev = utils.product.list.getData();
      utils.product.list.setData(undefined, (old) =>
        old?.map((p) =>
          p.id === newData.id
            ? {
                ...p,
                name: newData.name,
                price: newData.price,
                cost: newData.cost ?? null,
                unit: newData.unit ?? "und",
                taxSlots: newData.taxSlots ?? [],
                stock: (newData.trackStock ?? true) ? newData.stock : 0,
                trackStock: newData.trackStock ?? true,
                category: newData.category ?? null,
                lotNumber: newData.lotNumber ?? null,
                expiresAt: newData.expiresAt ?? null,
              }
            : p,
        ),
      );
      return { prev };
    },
    onError: (err, __, ctx) => {
      utils.product.list.setData(undefined, ctx?.prev);
      toast.error(`No se guardó el cambio: ${err.message}`);
    },
    onSuccess: async (data) => {
      toast.success(data.message);
      setActiveRow(null);
      await Promise.all([utils.product.list.invalidate(), utils.business.getSettings.invalidate()]);
    },
  });

  const updatePrice = api.product.updatePrice.useMutation({
    onMutate: async ({ productId, price }) => {
      await utils.product.list.cancel();
      const prev = utils.product.list.getData();
      utils.product.list.setData(undefined, (old) =>
        old?.map((p) => (p.id === productId ? { ...p, price } : p)),
      );
      return { prev };
    },
    onError: (err, __, ctx) => {
      utils.product.list.setData(undefined, ctx?.prev);
      toast.error(`No se guardó el cambio: ${err.message}`);
    },
    onSuccess: async (data) => {
      toast.success(data.message);
      setActiveRow(null);
      setPriceForm("");
      await utils.product.list.invalidate();
    },
  });

  const adjustStock = api.product.adjustStock.useMutation({
    onMutate: async ({ productId, quantity }) => {
      await utils.product.list.cancel();
      const prev = utils.product.list.getData();
      utils.product.list.setData(undefined, (old) =>
        old?.map((p) =>
          p.id === productId ? { ...p, stock: p.stock + quantity } : p,
        ),
      );
      return { prev };
    },
    onError: (err, __, ctx) => {
      utils.product.list.setData(undefined, ctx?.prev);
      toast.error(`No se guardó el cambio: ${err.message}`);
    },
    onSuccess: async (data) => {
      toast.success(data.message);
      setAdjustForm(emptyAdjust);
      setActiveRow(null);
      await utils.product.list.invalidate();
    },
  });

  const setActive = api.product.setActive.useMutation({
    onMutate: async ({ productId, isActive }) => {
      await utils.product.list.cancel();
      const prev = utils.product.list.getData();
      utils.product.list.setData(undefined, (old) =>
        old?.map((p) => (p.id === productId ? { ...p, isActive } : p)),
      );
      return { prev };
    },
    onError: (err, __, ctx) => {
      utils.product.list.setData(undefined, ctx?.prev);
      toast.error(`No se guardó el cambio: ${err.message}`);
    },
    onSuccess: async () => {
      await utils.product.list.invalidate();
    },
  });

  const openRow = (
    id: string,
    mode: RowMode,
    product?: {
      name: string;
      price: number;
      cost: number | null;
      unit: string;
      taxSlots: number[];
      stock: number;
      trackStock: boolean;
      category: string | null;
      lotNumber: string | null;
      expiresAt: Date | null;
      barcode: string | null;
      brand: string | null;
      presentation: string | null;
      openPrice: boolean;
      soldByWeight: boolean;
    },
  ) => {
    if (activeRow?.id === id && activeRow.mode === mode) {
      setActiveRow(null);
      return;
    }
    setActiveRow({ id, mode });
    if (mode === "edit" && product) {
      setEditForm({
        name: product.name,
        price: String(product.price),
        cost: product.cost != null ? String(product.cost) : "",
        unit: product.unit,
        taxSlots: product.taxSlots,
        stock: String(product.stock),
        trackStock: product.trackStock,
        category: product.category ?? "",
        lotNumber: product.lotNumber ?? "",
        expiresAt: toDateInput(product.expiresAt),
        barcode: product.barcode ?? "",
        brand: product.brand ?? "",
        presentation: product.presentation ?? "",
        openPrice: product.openPrice,
        soldByWeight: product.soldByWeight,
      });
    }
    if (mode === "price" && product) {
      setPriceForm(String(product.price));
      updatePrice.reset();
    }
    if (mode === "adjust") {
      setAdjustForm(emptyAdjust);
      adjustStock.reset();
    }
  };

  const closeRow = () => setActiveRow(null);

  const handleCreate = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = parseForm(createForm);
    if (Number.isNaN(parsed.price)) return;
    createProduct.mutate(parsed);
  };

  const handleUpdate = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeRow) return;
    const parsed = parseForm(editForm);
    if (Number.isNaN(parsed.price)) return;
    updateProduct.mutate({ id: activeRow.id, ...parsed });
  };

  const handleUpdatePrice = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeRow) return;
    const price = Number.parseFloat(priceForm);
    if (Number.isNaN(price) || price <= 0) return;
    updatePrice.mutate({ productId: activeRow.id, price });
  };

  const handleAdjust = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeRow) return;
    const qty = Number.parseInt(adjustForm.quantity, 10);
    if (Number.isNaN(qty) || qty === 0) return;
    adjustStock.mutate({
      productId: activeRow.id,
      quantity: qty,
      note: adjustForm.note.trim() || undefined,
    });
  };

  const createErrors = parseZodError(createProduct.error?.message ?? "");
  const updateErrors = parseZodError(updateProduct.error?.message ?? "");

  let listStatusMessage: string | null = null;
  if (loadingList) {
    listStatusMessage = "Cargando productos…";
  } else if (products?.length === 0) {
    listStatusMessage = "Aún no tienes productos. Crea el primero con el formulario de arriba.";
  } else if (filteredProducts?.length === 0) {
    listStatusMessage = `Ningún producto coincide con "${search}".`;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Productos registrados</h2>
          {userRole === "OWNER" && (
            <button
              type="button"
              onClick={() => {
                setShowCreate((v) => !v);
                createProduct.reset();
              }}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-violet-700"
            >
              {showCreate ? "Cancelar" : "+ Nuevo producto"}
            </button>
          )}
        </div>

        {products && products.length > 0 && (
          <div className="mb-4">
            <input
              aria-label="Buscar producto"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto por nombre..."
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-violet-500 dark:focus:ring-violet-400"
            />
          </div>
        )}

        {/* Formulario de creación — solo OWNER */}
        {userRole === "OWNER" && showCreate && (
          <form
            onSubmit={handleCreate}
            className="mb-5 space-y-3 border-b border-slate-200 pb-5 dark:border-white/10"
          >
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Crear nuevo producto
            </h3>
            <ProductFormFields
              form={createForm}
              onChange={makeChangeHandler(setCreateForm)}
              onCheckChange={makeCheckHandler(setCreateForm)}
              onSelectChange={makeSelectHandler(setCreateForm)}
              onToggleTaxSlot={makeToggleTaxSlotHandler(setCreateForm)}
              onBarcodeScanned={(code) => setCreateForm((p) => ({ ...p, barcode: code }))}
              onExclusiveCheckChange={makeExclusiveCheckHandler(setCreateForm)}
              fieldErrors={createErrors.fieldErrors}
              categories={categories}
              brands={brands}
              onBrandChange={(brand) => setCreateForm((p) => ({ ...p, brand }))}
              businessTaxes={businessTaxes}
              produceModuleEnabled={settings?.produceModuleEnabled ?? false}
              onApplyCalculator={(price, cost, taxSlots) =>
                setCreateForm((p) => ({
                  ...p,
                  price: String(price),
                  cost: String(cost),
                  taxSlots,
                }))
              }
            />
            {createErrors.formError && (
              <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                {createErrors.formError}
              </p>
            )}
            <button
              type="submit"
              disabled={createProduct.isPending}
              aria-busy={createProduct.isPending}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createProduct.isPending ? "Creando..." : "Crear producto"}
            </button>
          </form>
        )}

        {listStatusMessage ? (
          <output className="block text-sm text-slate-500 dark:text-slate-400">{listStatusMessage}</output>
        ) : (
          <>
            <div className="mb-1 hidden grid-cols-12 gap-2 px-1 text-xs font-medium text-slate-500 sm:grid dark:text-slate-400">
              <span className="col-span-4">Nombre</span>
              <span className="col-span-2 text-right">Precio</span>
              <span className="col-span-1 text-right">Stock</span>
              <span className="col-span-5 text-right">Acciones</span>
            </div>

            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredProducts?.map((product) => (
                <li key={product.id}>
                  <div className="grid grid-cols-12 items-start gap-2 py-3">
                    <div className="col-span-12 min-w-0 sm:col-span-4">
                      <p className="truncate text-sm font-medium">{product.name}</p>
                      {(product.brand ?? product.presentation) && (
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {[product.brand, product.presentation].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <ProductBadges product={product} />
                      {(product.lotNumber != null || product.expiresAt != null) && (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {[
                            product.lotNumber ? `Lote: ${product.lotNumber}` : null,
                            product.expiresAt ? `Vence: ${formatDate(product.expiresAt)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="col-span-7 pt-0.5 sm:col-span-2 sm:text-right">
                      <p className="text-sm tabular-nums">{formatCOP(product.price)}</p>
                      {/* Costo: solo visible para OWNER */}
                      {userRole === "OWNER" && product.cost != null && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Costo: {formatCOP(product.cost)}
                        </p>
                      )}
                    </div>
                    <p className="col-span-5 pt-0.5 text-sm tabular-nums sm:col-span-1 sm:text-right">
                      <span className="text-xs text-slate-500 sm:hidden dark:text-slate-400">Stock: </span>
                      {product.trackStock ? product.stock : "∞"}
                    </p>

                    {/* Botones de acción — condicionados por rol */}
                    <ProductRowActions
                      product={product}
                      userRole={userRole}
                      canEditPrices={canEditPrices}
                      activeRow={activeRow}
                      openRow={openRow}
                      setActive={setActive}
                    />
                  </div>

                  {/* Panel: Editar completo (solo OWNER) */}
                  {activeRow?.id === product.id && activeRow.mode === "edit" && (
                    <ProductEditPanel
                      formProps={{
                        form: editForm,
                        onChange: makeChangeHandler(setEditForm),
                        onCheckChange: makeCheckHandler(setEditForm),
                        onSelectChange: makeSelectHandler(setEditForm),
                        onToggleTaxSlot: makeToggleTaxSlotHandler(setEditForm),
                        onBarcodeScanned: (code) => setEditForm((p) => ({ ...p, barcode: code })),
                        onExclusiveCheckChange: makeExclusiveCheckHandler(setEditForm),
                        fieldErrors: updateErrors.fieldErrors,
                        categories,
                        brands,
                        onBrandChange: (brand) => setEditForm((p) => ({ ...p, brand })),
                        businessTaxes,
                        produceModuleEnabled: settings?.produceModuleEnabled ?? false,
                        onApplyCalculator: (price, cost, taxSlots) =>
                          setEditForm((p) => ({ ...p, price: String(price), cost: String(cost), taxSlots })),
                      }}
                      formError={updateErrors.formError}
                      isPending={updateProduct.isPending}
                      onSubmit={handleUpdate}
                      onCancel={closeRow}
                    />
                  )}

                  {/* Panel: Actualizar precio (CASHIER y OWNER si quiere) */}
                  {activeRow?.id === product.id && activeRow.mode === "price" && (
                    <ProductPricePanel
                      currentPrice={product.price}
                      priceForm={priceForm}
                      onPriceChange={setPriceForm}
                      onSubmit={handleUpdatePrice}
                      isPending={updatePrice.isPending}
                      errorMessage={updatePrice.error?.message}
                      onCancel={closeRow}
                    />
                  )}

                  {/* Panel: Ajustar stock (ambos roles) */}
                  {activeRow?.id === product.id && activeRow.mode === "adjust" && (
                    <ProductAdjustPanel
                      adjustForm={adjustForm}
                      onQuantityChange={(value) => setAdjustForm((p) => ({ ...p, quantity: value }))}
                      onNoteChange={(value) => setAdjustForm((p) => ({ ...p, note: value }))}
                      onSubmit={handleAdjust}
                      isPending={adjustStock.isPending}
                      errorMessage={adjustStock.error?.message}
                      onCancel={closeRow}
                    />
                  )}

                  {/* Panel: Historial (movimientos para tracked, ventas para no-tracked) */}
                  {activeRow?.id === product.id && activeRow.mode === "history" && (
                    <div className="border-t border-slate-100 pb-4 pt-3 dark:border-white/5">
                      <ProductHistoryPanel
                        trackStock={product.trackStock}
                        movementsQuery={movementsQuery}
                        salesQuery={salesQuery}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
