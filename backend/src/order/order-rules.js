import { ApiException } from '../common/api-exception.js';

export class OrderRules {
  static terminal(status) {
    return ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(status);
  }

  static transition(from, to, payment, seller, contact) {
    let valid = false;

    switch (to) {
      case 'ACCEPTED':
        valid = seller && from === 'PENDING_CONTACT' && contact;
        break;
      case 'PREPARING':
        valid = seller && from === 'ACCEPTED';
        break;
      case 'READY':
        valid = seller && from === 'PREPARING';
        break;
      case 'COMPLETED':
        valid = seller && from === 'READY' && payment === 'PAID';
        break;
      case 'REJECTED':
        valid = seller && from === 'PENDING_CONTACT';
        break;
      case 'CANCELLED':
        valid =
          !this.terminal(from) &&
          (seller || (from === 'PENDING_CONTACT' && payment === 'UNPAID'));
        break;
      case 'EXPIRED':
        valid = from === 'PENDING_CONTACT' && payment === 'UNPAID';
        break;
      default:
        valid = false;
    }

    ApiException.check(
      valid,
      409,
      'INVALID_TRANSITION',
      seller && from === 'PENDING_CONTACT' && to === 'ACCEPTED' && !contact
        ? 'Cần ghi nhận liên hệ thành công với khách trước khi chấp nhận đơn.'
        : 'Không thể thực hiện ở trạng thái hiện tại.'
    );
  }
}
