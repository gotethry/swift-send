import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BottomNav } from '@/components/BottomNav';
import { ArrowLeft, Star, Pencil, Trash2, UserPlus, Mail, Phone, Wallet, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useBeneficiaries, type Beneficiary, type IdentifierType } from '@/hooks/useBeneficiaries';

type View = 'list' | 'add' | 'edit';

const IDENTIFIER_ICONS: Record<IdentifierType, React.ReactNode> = {
  email: <Mail className="w-4 h-4" />,
  phone: <Phone className="w-4 h-4" />,
  wallet: <Wallet className="w-4 h-4" />,
};

export default function Beneficiaries() {
  const navigate = useNavigate();
  const { beneficiaries, add, update, toggleFavorite, remove } = useBeneficiaries();

  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<Beneficiary | null>(null);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState({
    name: '',
    identifier: '',
    identifierType: 'email' as IdentifierType,
    nickname: '',
    country: '',
    currency: '',
  });

  const resetForm = () =>
    setForm({ name: '', identifier: '', identifierType: 'email', nickname: '', country: '', currency: '' });

  const openAdd = () => {
    resetForm();
    setEditing(null);
    setView('add');
  };

  const openEdit = (b: Beneficiary) => {
    setForm({
      name: b.name,
      identifier: b.identifier,
      identifierType: b.identifierType,
      nickname: b.nickname ?? '',
      country: b.country ?? '',
      currency: b.currency ?? '',
    });
    setEditing(b);
    setView('edit');
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.identifier.trim()) {
      toast.error('Name and identifier are required');
      return;
    }
    if (editing) {
      update(editing.id, {
        name: form.name.trim(),
        nickname: form.nickname.trim() || undefined,
        country: form.country.trim() || undefined,
        currency: form.currency.trim() || undefined,
      });
      toast.success('Beneficiary updated');
    } else {
      add({
        name: form.name.trim(),
        identifier: form.identifier.trim(),
        identifierType: form.identifierType,
        nickname: form.nickname.trim() || undefined,
        country: form.country.trim() || undefined,
        currency: form.currency.trim() || undefined,
      });
      toast.success('Beneficiary added');
    }
    resetForm();
    setView('list');
  };

  const handleDelete = (b: Beneficiary) => {
    remove(b.id);
    toast.success(`${b.name} removed`);
  };

  const filtered = beneficiaries.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.identifier.toLowerCase().includes(search.toLowerCase()) ||
      (b.nickname ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  if (view === 'add' || view === 'edit') {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
          <button onClick={() => setView('list')} className="p-2 hover:bg-gray-100 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">{view === 'edit' ? 'Edit Beneficiary' : 'Add Beneficiary'}</h1>
        </div>

        <div className="px-4 py-6 space-y-4">
          <div>
            <Label htmlFor="name">Full Name *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="John Doe"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="identifier">Email / Phone / Wallet *</Label>
            <Input
              id="identifier"
              value={form.identifier}
              onChange={(e) => setForm({ ...form, identifier: e.target.value })}
              placeholder="john@example.com or +1234567890"
              className="mt-1"
              disabled={view === 'edit'}
            />
          </div>

          {view === 'add' && (
            <div>
              <Label htmlFor="type">Identifier Type</Label>
              <select
                id="type"
                value={form.identifierType}
                onChange={(e) =>
                  setForm({ ...form, identifierType: e.target.value as IdentifierType })
                }
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-white"
              >
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="wallet">Wallet Address</option>
              </select>
            </div>
          )}

          <div>
            <Label htmlFor="nickname">Nickname (optional)</Label>
            <Input
              id="nickname"
              value={form.nickname}
              onChange={(e) => setForm({ ...form, nickname: e.target.value })}
              placeholder="e.g. Mom, Business Partner"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="country">Country (optional)</Label>
              <Input
                id="country"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                placeholder="US, MX, PH…"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="currency">Currency (optional)</Label>
              <Input
                id="currency"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                placeholder="USD, MXN…"
                className="mt-1"
              />
            </div>
          </div>

          <Button onClick={handleSave} className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-4">
            {view === 'edit' ? 'Save Changes' : 'Add Beneficiary'}
          </Button>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold flex-1">Beneficiaries</h1>
        <button
          onClick={openAdd}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          <UserPlus className="w-4 h-4" />
          Add
        </button>
      </div>

      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search beneficiaries…"
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <UserPlus className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">{search ? 'No matches found' : 'No beneficiaries yet'}</p>
          {!search && (
            <Button onClick={openAdd} variant="outline" className="mt-4 text-sm">
              Add your first beneficiary
            </Button>
          )}
        </div>
      ) : (
        <ul className="px-4 space-y-3 pb-4">
          {filtered.map((b) => (
            <li
              key={b.id}
              className="bg-white rounded-xl shadow-sm border flex items-center gap-3 px-4 py-3"
            >
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm shrink-0">
                {b.name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {b.nickname ? `${b.name} (${b.nickname})` : b.name}
                </p>
                <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                  {IDENTIFIER_ICONS[b.identifierType]}
                  {b.identifier}
                </p>
                {(b.country || b.currency) && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {[b.country, b.currency].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => toggleFavorite(b.id)}
                  className={`p-1.5 rounded-full hover:bg-yellow-50 transition-colors ${
                    b.isFavorite ? 'text-yellow-500' : 'text-gray-300'
                  }`}
                  title={b.isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
                >
                  <Star className="w-4 h-4" fill={b.isFavorite ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={() => openEdit(b)}
                  className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(b)}
                  className="p-1.5 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <BottomNav />
    </div>
  );
}
