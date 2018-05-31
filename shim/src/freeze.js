import { tamperProofDataProperties } from './tamper-proof';
import { deepFreeze } from './deep-freeze';
import { assign, create } from './commons';

export default function freeze(realm) {
  // Copy the intrinsics into a plain object to avoid
  // freezing the object itself.
  const obj = create(null);
  const intrinsics = realm.intrinsics;
  assign(obj, intrinsics);
  tamperProofDataProperties(obj);
  deepFreeze(obj);
}
