import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ProfileService } from '../../services/profile/profile.service';
import { AddressData } from '../../utils/businessRegistrationStore';
import { LayoutContext } from '../../layouts/general-layout';
import AddressSearch from '../address-search';
import './location-editor.scss';


interface Props {
  entityType: 'BUSINESS' | 'EMPLOYEE';
  entityId: string;
  initialAddress: AddressData | null;
  onSaved: () => void;
}

interface AddressSelectResult {
  street_1: string;
  city: string;
  district?: string;
  state: string;
  postal_code: string;
  country: string;
  latitude?: number;
  longitude?: number;
}

interface FieldDef {
  key: keyof AddressData;
  labelKey: string;
  placeholderKey: string;
  fullWidth?: boolean;
}

const FIELD_DEFS: FieldDef[] = [
  { key: 'unit_number', labelKey: 'unitNumber', placeholderKey: 'enterUnitNumber' },
  { key: 'building', labelKey: 'building', placeholderKey: 'enterBuilding' },
  { key: 'floor', labelKey: 'floor', placeholderKey: 'enterFloor' },
  { key: 'street_1', labelKey: 'street1', placeholderKey: 'enterStreet1', fullWidth: true },
  { key: 'street_2', labelKey: 'street2', placeholderKey: 'enterStreet2', fullWidth: true },
  { key: 'city', labelKey: 'city', placeholderKey: 'enterCity' },
  { key: 'district', labelKey: 'district', placeholderKey: 'enterDistrict' },
  { key: 'state', labelKey: 'state', placeholderKey: 'state' },
  { key: 'postal_code', labelKey: 'postalCode', placeholderKey: 'postalCode' },
  { key: 'country', labelKey: 'country', placeholderKey: 'country' },
];

const EMPTY_ADDRESS: AddressData = {
  unit_number: '', building: '', floor: '',
  street_1: '', street_2: '', city: '',
  district: '', state: '', postal_code: '', country: 'INDIA',
};


export default function LocationEditor({ entityType, entityId, initialAddress, onSaved }: Props) {
  const { t } = useTranslation();
  const profileService = useMemo(() => new ProfileService(), []);

  const [isEditing, setIsEditing] = useState(false);
  const [address, setAddress] = useState<AddressData>(EMPTY_ADDRESS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const startEditing = () => {
    setAddress(initialAddress ?? EMPTY_ADDRESS);
    setSaveError('');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setSaveError('');
  };

  // Called by AddressSearch when the user picks a suggestion or pins on the map.
  // Only overwrites non-empty values so manual overrides are preserved.
  const handleAddressSelect = (selected: AddressSelectResult) => {
    setAddress(prev => ({
      ...prev,
      street_1: selected.street_1 || prev.street_1,
      city: selected.city || prev.city,
      district: selected.district ?? prev.district,
      state: selected.state || prev.state,
      postal_code: selected.postal_code || prev.postal_code,
      country: selected.country || prev.country,
      latitude: selected.latitude,
      longitude: selected.longitude,
    }));
  };

  const handleSave = async () => {
    if (
      !address.street_1?.trim() ||
      !address.city?.trim() ||
      !address.state?.trim() ||
      !address.postal_code?.trim()
    ) {
      setSaveError(t('enterBusinessAddress'));
      return;
    }
    if (!entityId) return;

    setSaving(true);
    setSaveError('');
    try {
      await profileService.updateAddress(entityType, entityId, {
        ...address,
        street_1: address.street_1,
        city: address.city,
        state: address.state,
        postal_code: address.postal_code,
      });
      setIsEditing(false);
      onSaved();
    } catch (err: any) {
      setSaveError(
        err?.response?.data?.detail?.message ||
        err?.message ||
        t('failedToLoadEmployees')
      );
    } finally {
      setSaving(false);
    }
  };

  // Pre-fill the AddressSearch input with the saved address string
  const searchInitialValue = initialAddress?.street_1
    ? [initialAddress.street_1, initialAddress.city, initialAddress.state]
        .filter(Boolean)
        .join(', ')
    : '';

  const title = entityType === 'BUSINESS' ? t('businessLocation') : t('location');

  return (
    <div className="location-editor">
      {/* Header with edit / save / cancel controls */}
      <div className="section-header section-header-actions">
        <h2 className="section-title">{title}</h2>

        {!isEditing ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={startEditing}
            disabled={!entityId}
          >
            {t('editProfile')}
          </button>
        ) : (
          <div className="section-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={cancelEditing}
              disabled={saving}
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? t('saving') : t('saveChanges')}
            </button>
          </div>
        )}
      </div>

      {/* Validation / API error */}
      {saveError && (
        <div className="profile-save-error" role="alert">
          {saveError}
        </div>
      )}

      {/* Address autocomplete + map — only shown in edit mode.
          AddressSearch / AddressMap use useLayoutContext internally, so we
          must provide LayoutContext even outside the GeneralLayout route tree. */}
      {isEditing && (
        <div className="location-search-wrapper">
          <LayoutContext.Provider value={{ t }}>
            <AddressSearch
              onAddressSelect={handleAddressSelect}
              initialValue={searchInitialValue}
            />
          </LayoutContext.Provider>
        </div>
      )}

      {/* Address fields — read-only in view mode, editable in edit mode */}
      <div className="info-grid">
        {FIELD_DEFS.map(({ key, labelKey, placeholderKey, fullWidth }) => (
          <div key={key} className={`info-field${fullWidth ? ' full-width' : ''}`}>
            <label className="info-label">{t(labelKey)}</label>
            {isEditing ? (
              <input
                type="text"
                className="info-input"
                value={(address[key] as string) || ''}
                onChange={e => setAddress(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={t(placeholderKey)}
              />
            ) : (
              <div className="info-value">
                {(initialAddress?.[key] as string) || t('notAvailable')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
